import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type { Perimeter, PersonStatus } from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import type { DbOrTx } from "../db";
import { can, personPageAccess } from "../policy/can";
import { loadPersonFactsMany } from "../policy/facts";
import type { Actor } from "../policy/types";
import { directoryVisibilitySql, perimeterSql, type VisibilityContext } from "../policy/visibility";
import { escapeLike, searchTerms } from "../repositories/personRepository";
import { minorSql } from "../sensitive";
import { numericSettings } from "../settings";
import {
  directorySummary,
  qualificationsOf,
  type DirectoryTrainingSummary,
} from "../trainingSummary";

/**
 * The directory (`/benevoles`). Visibility is applied **in SQL, before
 * counting and paginating** (`directoryVisibilitySql`): a person the actor may
 * not see never appears, not even in the count. Each page then costs a fixed
 * number of queries, whatever its size (no N+1).
 */

export const DIRECTORY_PAGE_SIZE = 50;
export const DEFAULT_DIRECTORY_STATUSES: readonly PersonStatus[] = [
  "ACTIVE",
  "PAUSED",
  "SUSPENDED",
];
const STATUSES = ["CANDIDATE", "ACTIVE", "PAUSED", "SUSPENDED", "INACTIVE", "LEFT"] as const;
const PERIMETERS = ["ACTION", "LASER", "FORMAT_GP"] as const;

const csv = <T extends string>(values: readonly [T, ...T[]]) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      const allowed = new Set<string>(values);
      return (raw ?? "")
        .split(",")
        .map((v) => v.trim().toUpperCase())
        .filter((v): v is T => allowed.has(v));
    });

const flag = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "oui");

/** URL parameters of `/benevoles` (French names), validated. Invalid values are ignored. */
export const directoryQuerySchema = z.object({
  q: z
    .string()
    .optional()
    .transform((v) => (v ?? "").slice(0, 100).trim()),
  statut: csv(STATUSES),
  perimetre: csv(PERIMETERS),
  qualification: z
    .string()
    .optional()
    .transform((v) => {
      const code = (v ?? "").trim().toUpperCase();
      return /^[A-Z0-9_]{1,40}$/.test(code) ? code : null;
    }),
  echeance: z
    .enum(["proche", "expiree"])
    .optional()
    .catch(undefined)
    .transform((v) => v ?? null),
  mineur: flag,
  formateur: flag,
  archives: flag,
  apres: z
    .string()
    .optional()
    .transform((v) => (v && /^[a-z0-9_]{10,40}$/i.test(v) ? v : null)),
});

export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

/** Parses `searchParams` (first value of each key). */
export function parseDirectoryQuery(
  searchParams: Record<string, string | string[] | undefined>,
): DirectoryQuery {
  const first = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  return directoryQuerySchema.parse(first);
}

/** True when the query has a filter other than the default statuses. */
export function hasFilters(query: DirectoryQuery): boolean {
  return (
    query.q !== "" ||
    query.statut.length > 0 ||
    query.perimetre.length > 0 ||
    query.qualification !== null ||
    query.echeance !== null ||
    query.mineur ||
    query.formateur ||
    query.archives
  );
}

/** One line of the directory. Only what the actor may see. */
export interface DirectoryRow {
  id: string;
  ref: string;
  nivol: string | null;
  firstName: string;
  lastName: string;
  usageName: string | null;
  status: PersonStatus;
  email: string | null;
  phone: string | null;
  archived: boolean;
  /** The line links to the person page (full, or reduced to the trainings for FORMAT). */
  canOpen: boolean;
  /** Present only with `training.read` on this person. */
  training: DirectoryTrainingSummary | null;
}

export interface DirectoryPage {
  rows: DirectoryRow[];
  /** Visible people matching the filters (all pages). */
  total: number;
  nextCursor: string | null;
  alertDays: number;
  statuses: readonly PersonStatus[];
}

/**
 * The latest known expiry per held reference, in SQL (mirror of
 * `qualificationsOf`): « expired » = before `day`, « soon » = within
 * `alertDays` days.
 */
export function deadlineSql(kind: "proche" | "expiree", day: Date, alertDays: number): Prisma.Sql {
  const limit = new Date(day.getTime() + alertDays * 86_400_000);
  const range =
    kind === "expiree"
      ? Prisma.sql`d.expiry < ${day}::date`
      : Prisma.sql`d.expiry >= ${day}::date AND d.expiry <= ${limit}::date`;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM (
      SELECT MAX(tr.expires_at) AS expiry FROM training_records tr
      WHERE tr.person_id = p.id AND tr.result = 'PASSED'::"TrainingResult"
        AND tr.cancelled_at IS NULL AND tr.expires_at IS NOT NULL
      GROUP BY tr.reference_id
    ) d WHERE ${range}
  )`;
}

function qualificationSql(code: string, day: Date): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM training_records tr
    JOIN reference_items ri ON ri.id = tr.reference_id
    WHERE tr.person_id = p.id AND ri.code = ${code}
      AND tr.result = 'PASSED'::"TrainingResult" AND tr.cancelled_at IS NULL
      AND (tr.expires_at IS NULL OR tr.expires_at >= ${day}::date)
  )`;
}

/** A name, usage name, birth name or NIVOL containing `term` (accents and case ignored). */
export function termSql(term: string): Prisma.Sql {
  const pattern = `%${escapeLike(term)}%`;
  const nivolPattern = `%${escapeLike(term.replace(/\s/g, "").toUpperCase())}%`;
  return Prisma.sql`(
    binivol_normalize(p.last_name) LIKE binivol_normalize(${pattern})
    OR binivol_normalize(p.first_name) LIKE binivol_normalize(${pattern})
    OR binivol_normalize(p.usage_name) LIKE binivol_normalize(${pattern})
    OR binivol_normalize(p.birth_name) LIKE binivol_normalize(${pattern})
    OR coalesce(p.nivol, '') LIKE ${nivolPattern}
  )`;
}

/** A NIVOL typed with spaces (« 000 9900 0002 C ») is one search term. */
export function directoryTerms(q: string): string[] {
  const compact = q.replace(/\s/g, "");
  if (/^\d{6,11}[a-zA-Z]?$/.test(compact)) return [compact];
  return searchTerms(q);
}

/** WHERE conditions of the directory, visibility first. */
export function directoryConditions(
  actor: Pick<Actor, "profiles">,
  query: DirectoryQuery,
  ctx: VisibilityContext & { alertDays: number },
): Prisma.Sql[] {
  const statuses = query.statut.length > 0 ? query.statut : DEFAULT_DIRECTORY_STATUSES;
  const conditions: Prisma.Sql[] = [
    directoryVisibilitySql(actor, ctx),
    Prisma.sql`p.status::text = ANY(${[...statuses]}::text[])`,
  ];
  if (!query.archives) conditions.push(Prisma.sql`p.archived_at IS NULL`);
  for (const term of directoryTerms(query.q)) conditions.push(termSql(term));
  if (query.perimetre.length > 0) {
    conditions.push(
      Prisma.sql`(${Prisma.join(
        query.perimetre.map((p: Perimeter) => perimeterSql(p, ctx.day)),
        " OR ",
      )})`,
    );
  }
  if (query.qualification) conditions.push(qualificationSql(query.qualification, ctx.day));
  if (query.echeance) conditions.push(deadlineSql(query.echeance, ctx.day, ctx.alertDays));
  if (query.mineur) conditions.push(minorSql(ctx.day));
  if (query.formateur) conditions.push(Prisma.sql`p.is_trainer IS TRUE`);
  return conditions;
}

const ORDER_KEY = Prisma.sql`(binivol_normalize(p.last_name), binivol_normalize(p.first_name), p.id)`;

/**
 * One page of the directory for `actor`.
 *
 * Queries: settings, count, page ids, people, facts (4), trainings — fixed,
 * whatever the page size.
 */
export async function listDirectory(
  db: DbOrTx,
  actor: Actor,
  query: DirectoryQuery,
  options: { day?: Date; pageSize?: number } = {},
): Promise<DirectoryPage> {
  const day = options.day ?? toParisDay();
  const pageSize = options.pageSize ?? DIRECTORY_PAGE_SIZE;
  const settings = await numericSettings(db);
  const ctx = {
    day,
    newVolunteerMonths: settings.newVolunteerMonths,
    alertDays: settings.alertDays,
  };
  const conditions = directoryConditions(actor, query, ctx);
  const where = Prisma.join(conditions, " AND ");
  const cursor = query.apres
    ? Prisma.sql`AND ${ORDER_KEY} > (
        SELECT binivol_normalize(c.last_name), binivol_normalize(c.first_name), c.id
        FROM persons c WHERE c.id = ${query.apres})`
    : Prisma.empty;

  const [countRows, idRows] = await Promise.all([
    db.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM persons p WHERE ${where}`,
    db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM persons p WHERE ${where} ${cursor}
      ORDER BY binivol_normalize(p.last_name), binivol_normalize(p.first_name), p.id
      LIMIT ${pageSize + 1}`,
  ]);
  const ids = idRows.slice(0, pageSize).map((r) => r.id);
  const statuses = query.statut.length > 0 ? query.statut : DEFAULT_DIRECTORY_STATUSES;
  const total = Number(countRows[0]?.n ?? 0);
  if (ids.length === 0) {
    return { rows: [], total, nextCursor: null, alertDays: settings.alertDays, statuses };
  }

  const [people, facts, records] = await Promise.all([
    db.person.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        ref: true,
        nivol: true,
        firstName: true,
        lastName: true,
        usageName: true,
        status: true,
        email: true,
        phone: true,
        archivedAt: true,
      },
    }),
    loadPersonFactsMany(db, ids, day, settings.newVolunteerMonths),
    db.trainingRecord.findMany({
      where: { personId: { in: ids }, result: "PASSED", cancelledAt: null },
      select: {
        personId: true,
        referenceId: true,
        result: true,
        date: true,
        expiresAt: true,
        cancelledAt: true,
        reference: { select: { code: true, label: true, category: true, sortOrder: true } },
      },
    }),
  ]);

  const recordsByPerson = new Map<string, typeof records>();
  for (const record of records) {
    const list = recordsByPerson.get(record.personId) ?? [];
    list.push(record);
    recordsByPerson.set(record.personId, list);
  }
  const byId = new Map(people.map((p) => [p.id, p]));
  const rows = ids.flatMap((id): DirectoryRow[] => {
    const person = byId.get(id);
    const personFacts = facts.get(id);
    if (!person || !personFacts) return [];
    const resource = { person: personFacts };
    // Defence in depth: the SQL already filtered, `can()` has the last word.
    if (!can(actor, "person.directory.read", resource).allowed) return [];
    const training = can(actor, "training.read", resource).allowed
      ? directorySummary(
          qualificationsOf(
            (recordsByPerson.get(id) ?? []).map((r) => ({ ...r, ...r.reference })),
            day,
            settings.alertDays,
          ),
        )
      : null;
    return [
      {
        id: person.id,
        ref: person.ref,
        nivol: person.nivol,
        firstName: person.firstName,
        lastName: person.lastName,
        usageName: person.usageName,
        status: person.status,
        email: person.email,
        phone: person.phone,
        archived: person.archivedAt !== null,
        canOpen: personPageAccess(actor, personFacts) !== null,
        training,
      },
    ];
  });
  return {
    rows,
    total,
    nextCursor: idRows.length > pageSize ? (ids.at(-1) ?? null) : null,
    alertDays: settings.alertDays,
    statuses,
  };
}

/** Training codes offered by the « Qualification » filter (active trainings). */
export async function qualificationOptions(db: DbOrTx): Promise<{ code: string; label: string }[]> {
  return db.referenceItem.findMany({
    where: { kind: "TRAINING", active: true },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    select: { code: true, label: true },
  });
}

/** True when the actor sees archived people in the directory (TOPAZE), from `can()`. */
export function directoryShowsArchived(actor: Pick<Actor, "profiles">): boolean {
  return can(actor, "person.directory.read", {
    person: {
      personId: "",
      status: "ACTIVE",
      perimeters: new Set(),
      inDiamantScope: false,
      archived: true,
    },
  }).allowed;
}
