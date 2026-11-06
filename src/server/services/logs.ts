import type { AccessScope, AuditAction } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { csvFileName, toCsv } from "@/lib/csv";
import { toParisDay } from "@/lib/dates";
import { ACCESS_SCOPE_LABELS, AUDIT_ACTION_LABELS } from "@/lib/labels";
import type { DbOrTx } from "../db";
import { authorize } from "../policy/can";
import type { Actor } from "../policy/types";

/**
 * /admin/journaux (step 14, TOPAZE): the audit log and the log of sensitive
 * consultations, filtered and paginated **in the database**. Values were
 * masked when written (`withAudit`); nothing is unmasked here.
 */

export const LOG_PAGE_SIZE = 50;
/** « Abus » filter: at least this many consultations of one person by one user in 24 h. */
export const ABUSE_THRESHOLD = 5;

const AUDIT_ACTIONS = Object.keys(AUDIT_ACTION_LABELS) as AuditAction[];
const SCOPES = Object.keys(ACCESS_SCOPE_LABELS) as AccessScope[];

export interface LogFilters {
  from: Date | null;
  to: Date | null;
  userId: string | null;
  personRef: string | null;
  entity: string | null;
  action: AuditAction | null;
  scope: AccessScope | null;
  page: number;
}

const day = (v: string | undefined) =>
  v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00.000Z`) : null;

export function parseLogFilters(raw: Record<string, string | undefined>): LogFilters {
  return {
    from: day(raw.du),
    to: day(raw.au),
    userId: raw.auteur && /^[a-z0-9_]{6,40}$/i.test(raw.auteur) ? raw.auteur : null,
    personRef: raw.personne && /^P-\d{5,}$/.test(raw.personne) ? raw.personne : null,
    entity: raw.objet && /^[A-Za-z]{2,40}$/.test(raw.objet) ? raw.objet : null,
    action: AUDIT_ACTIONS.find((a) => a === raw.action) ?? null,
    scope: SCOPES.find((s) => s === raw.portee) ?? null,
    page: Math.max(1, Math.min(10_000, Number.parseInt(raw.page ?? "1", 10) || 1)),
  };
}

async function personIdOf(db: DbOrTx, ref: string | null): Promise<string | null | undefined> {
  if (!ref) return undefined;
  const p = await db.person.findUnique({ where: { ref }, select: { id: true } });
  return p?.id ?? null;
}

function period(filters: LogFilters) {
  const at: Prisma.DateTimeFilter = {};
  if (filters.from) at.gte = filters.from;
  if (filters.to) at.lt = new Date(filters.to.getTime() + 86_400_000);
  return Object.keys(at).length > 0 ? { at } : {};
}

export interface AuditRow {
  id: string;
  at: Date;
  author: string;
  action: AuditAction;
  entity: string | null;
  entityId: string | null;
  field: string | null;
  oldValue: string;
  newValue: string;
}

const short = (v: unknown) => {
  if (v === null || v === undefined) return "";
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
};

async function auditWhere(db: DbOrTx, filters: LogFilters): Promise<Prisma.AuditLogWhereInput> {
  const personId = await personIdOf(db, filters.personRef);
  return {
    ...period(filters),
    ...(filters.userId ? { actorId: filters.userId } : {}),
    ...(filters.entity ? { entity: filters.entity } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(personId !== undefined ? { entityId: personId ?? "§none" } : {}),
  };
}

export async function auditLogPage(
  db: DbOrTx,
  actor: Actor,
  filters: LogFilters,
  pageSize = LOG_PAGE_SIZE,
): Promise<{ rows: AuditRow[]; total: number }> {
  authorize(actor, "audit.read");
  const where = await auditWhere(db, filters);
  const [total, rows, users] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * pageSize,
      take: pageSize,
    }),
    db.user.findMany({ select: { id: true, name: true } }),
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      at: r.at,
      author: (r.actorId ? names.get(r.actorId) : null) ?? r.actorLabel ?? "Système",
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      field: r.field,
      oldValue: short(r.oldValue),
      newValue: short(r.newValue),
    })),
  };
}

export interface AccessRow {
  id: string;
  at: Date;
  user: string;
  person: string;
  scope: AccessScope;
  context: string | null;
}

async function accessWhere(db: DbOrTx, filters: LogFilters): Promise<Prisma.AccessLogWhereInput> {
  const personId = await personIdOf(db, filters.personRef);
  return {
    ...period(filters),
    ...(filters.userId ? { userId: filters.userId } : {}),
    ...(filters.scope ? { scope: filters.scope } : {}),
    ...(personId !== undefined ? { personId: personId ?? "§none" } : {}),
  };
}

async function describeAccess(
  db: DbOrTx,
  rows: {
    id: string;
    at: Date;
    userId: string | null;
    personId: string | null;
    scope: AccessScope;
    context: string | null;
  }[],
): Promise<AccessRow[]> {
  const [users, people] = await Promise.all([
    db.user.findMany({ select: { id: true, name: true } }),
    db.person.findMany({
      where: { id: { in: rows.flatMap((r) => (r.personId ? [r.personId] : [])) } },
      select: { id: true, ref: true, firstName: true, lastName: true },
    }),
  ]);
  const userNames = new Map(users.map((u) => [u.id, u.name]));
  const personNames = new Map(people.map((p) => [p.id, `${p.firstName} ${p.lastName} (${p.ref})`]));
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    user: (r.userId ? userNames.get(r.userId) : null) ?? "Inconnu",
    person: r.personId ? (personNames.get(r.personId) ?? "Fiche purgée") : "",
    scope: r.scope,
    context: r.context,
  }));
}

export async function accessLogPage(
  db: DbOrTx,
  actor: Actor,
  filters: LogFilters,
  pageSize = LOG_PAGE_SIZE,
): Promise<{ rows: AccessRow[]; total: number }> {
  authorize(actor, "accessLog.read");
  const where = await accessWhere(db, filters);
  const [total, rows] = await Promise.all([
    db.accessLog.count({ where }),
    db.accessLog.findMany({
      where,
      orderBy: [{ at: "desc" }, { id: "desc" }],
      skip: (filters.page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { total, rows: await describeAccess(db, rows) };
}

export interface AbuseRow {
  user: string;
  person: string;
  count: number;
  first: Date;
  last: Date;
}

/**
 * « Consultations par une même personne sur 24 h »: pairs (user, person)
 * with at least `ABUSE_THRESHOLD` consultations in a sliding 24 h window
 * ending now.
 */
export async function frequentConsultations(
  db: DbOrTx,
  actor: Actor,
  now: Date = new Date(),
  threshold = ABUSE_THRESHOLD,
): Promise<AbuseRow[]> {
  authorize(actor, "accessLog.read");
  const since = new Date(now.getTime() - 86_400_000);
  const rows = await db.$queryRaw<
    { user_id: string | null; person_id: string | null; n: bigint; first: Date; last: Date }[]
  >`
    SELECT user_id, person_id, count(*) AS n, min(at) AS first, max(at) AS last
    FROM access_logs
    WHERE at >= ${since} AND person_id IS NOT NULL
    GROUP BY user_id, person_id
    HAVING count(*) >= ${threshold}
    ORDER BY count(*) DESC
    LIMIT 100`;
  const described = await describeAccess(
    db,
    rows.map((r, i) => ({
      id: String(i),
      at: r.last,
      userId: r.user_id,
      personId: r.person_id,
      scope: "SENSITIVE_VIEW" as const,
      context: null,
    })),
  );
  return rows.map((r, i) => ({
    user: described[i]?.user ?? "Inconnu",
    person: described[i]?.person ?? "",
    count: Number(r.n),
    first: r.first,
    last: r.last,
  }));
}

/** CSV of a log with the current filters (5 000 lines at most), itself journaled. */
export async function logExport(
  db: DbOrTx,
  actor: Actor,
  journal: "audit" | "acces",
  filters: LogFilters,
): Promise<{ fileName: string; csv: string; rows: number }> {
  const all = { ...filters, page: 1 };
  let csv: string;
  let count: number;
  if (journal === "audit") {
    const { rows } = await auditLogPage(db, actor, all, 5000);
    count = rows.length;
    csv = toCsv(rows, [
      { header: "Date", value: (r) => r.at.toISOString() },
      { header: "Auteur", value: (r) => r.author },
      { header: "Action", value: (r) => AUDIT_ACTION_LABELS[r.action] },
      { header: "Objet", value: (r) => r.entity },
      { header: "Identifiant", value: (r) => r.entityId },
      { header: "Champ", value: (r) => r.field },
      { header: "Avant", value: (r) => r.oldValue },
      { header: "Après", value: (r) => r.newValue },
    ]);
  } else {
    const { rows } = await accessLogPage(db, actor, all, 5000);
    count = rows.length;
    csv = toCsv(rows, [
      { header: "Date", value: (r) => r.at.toISOString() },
      { header: "Utilisateur", value: (r) => r.user },
      { header: "Personne", value: (r) => r.person },
      { header: "Portée", value: (r) => ACCESS_SCOPE_LABELS[r.scope] },
      { header: "Contexte", value: (r) => r.context },
    ]);
  }
  await db.accessLog.create({
    data: {
      userId: actor.userId,
      scope: "EXPORT",
      context: `export:journal-${journal}:${String(count)} lignes`,
    },
  });
  return { fileName: csvFileName(`journal-${journal}`, toParisDay()), csv, rows: count };
}
