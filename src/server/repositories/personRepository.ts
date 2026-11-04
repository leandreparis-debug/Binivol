import { Prisma } from "@/generated/prisma/client";
import type { PersonStatus } from "@/generated/prisma/enums";
import type { DbOrTx } from "../db";
import { translateDbError } from "../errors";

/** Non-sensitive fields returned by lists and lookups. */
export const personSummarySelect = {
  id: true,
  ref: true,
  nivol: true,
  civility: true,
  firstName: true,
  lastName: true,
  usageName: true,
  status: true,
  entryDate: true,
  archivedAt: true,
} satisfies Prisma.PersonSelect;

export type PersonSummary = Prisma.PersonGetPayload<{ select: typeof personSummarySelect }>;

export interface PersonSearchParams {
  /** Free text: words are matched (accent- and case-insensitive) on last, first and usage name, and NIVOL. */
  q?: string | null;
  /** One status or several. */
  status?: PersonStatus | readonly PersonStatus[] | null;
  /** Page size, 1 to 100. Default 20. */
  take?: number;
  /** Id of the last person of the previous page. */
  cursor?: string | null;
  /** Include archived people. Default false. */
  includeArchived?: boolean;
}

export interface PersonSearchPage {
  items: PersonSummary[];
  /** Pass it as `cursor` to get the next page; null on the last page. */
  nextCursor: string | null;
}

export const MAX_PAGE_SIZE = 100;

/** Escapes LIKE wildcards so user input is matched literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Splits a query into search words (spaces, commas and semicolons separate them). */
export function searchTerms(q: string | null | undefined): string[] {
  return (q ?? "")
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .slice(0, 6);
}

function termCondition(term: string): Prisma.Sql {
  const pattern = `%${escapeLike(term)}%`;
  const nivolPattern = `%${escapeLike(term.toUpperCase())}%`;
  return Prisma.sql`(
    binivol_normalize(p.last_name) LIKE binivol_normalize(${pattern})
    OR binivol_normalize(p.first_name) LIKE binivol_normalize(${pattern})
    OR binivol_normalize(p.usage_name) LIKE binivol_normalize(${pattern})
    OR binivol_normalize(p.birth_name) LIKE binivol_normalize(${pattern})
    OR coalesce(p.nivol, '') LIKE ${nivolPattern}
  )`;
}

/**
 * Read access to people. Accepts a client or a transaction.
 * Sensitive data (`PersonSensitive`, contacts, documents) is never loaded here.
 */
export function personRepository(db: DbOrTx) {
  return {
    /** Finds a person by readable number (`P-00042`, case-insensitive). */
    async findByRef(ref: string): Promise<PersonSummary | null> {
      const normalized = ref.trim().toUpperCase();
      if (normalized === "") return null;
      return db.person.findUnique({ where: { ref: normalized }, select: personSummarySelect });
    },

    /**
     * Searches people, ordered by last name then first name (accent-insensitive),
     * with keyset pagination on the person id.
     */
    async search(params: PersonSearchParams = {}): Promise<PersonSearchPage> {
      const take = Math.min(Math.max(Math.trunc(params.take ?? 20), 1), MAX_PAGE_SIZE);
      const statuses =
        params.status === null || params.status === undefined
          ? []
          : Array.isArray(params.status)
            ? [...(params.status as readonly PersonStatus[])]
            : [params.status as PersonStatus];

      const conditions: Prisma.Sql[] = [];
      if (!params.includeArchived) conditions.push(Prisma.sql`p.archived_at IS NULL`);
      if (statuses.length > 0)
        conditions.push(Prisma.sql`p.status::text = ANY(${statuses}::text[])`);
      for (const term of searchTerms(params.q)) conditions.push(termCondition(term));
      if (params.cursor) {
        conditions.push(Prisma.sql`
          (binivol_normalize(p.last_name), binivol_normalize(p.first_name), p.id) >
          (SELECT binivol_normalize(c.last_name), binivol_normalize(c.first_name), c.id
             FROM persons c WHERE c.id = ${params.cursor})`);
      }
      const where =
        conditions.length > 0
          ? Prisma.sql`WHERE ${Prisma.join(conditions, " AND ")}`
          : Prisma.empty;

      const rows = await db.$queryRaw<{ id: string }[]>`
        SELECT p.id FROM persons p
        ${where}
        ORDER BY binivol_normalize(p.last_name), binivol_normalize(p.first_name), p.id
        LIMIT ${take + 1}
      `;
      const pageIds = rows.slice(0, take).map((r) => r.id);
      const found = await db.person.findMany({
        where: { id: { in: pageIds } },
        select: personSummarySelect,
      });
      const byId = new Map(found.map((p) => [p.id, p]));
      const items = pageIds.flatMap((id) => {
        const person = byId.get(id);
        return person ? [person] : [];
      });
      return { items, nextCursor: rows.length > take ? (pageIds.at(-1) ?? null) : null };
    },

    /**
     * Technical insert used by the seed, the import (step 4) and tests.
     * Database errors are translated into `DomainError` (duplicate NIVOL…).
     */
    async create(data: Prisma.PersonUncheckedCreateInput): Promise<PersonSummary> {
      try {
        return await db.person.create({ data, select: personSummarySelect });
      } catch (error) {
        throw translateDbError(error);
      }
    },

    /** Technical update, with the same error translation. */
    async update(id: string, data: Prisma.PersonUncheckedUpdateInput): Promise<PersonSummary> {
      try {
        return await db.person.update({ where: { id }, data, select: personSummarySelect });
      } catch (error) {
        throw translateDbError(error);
      }
    },
  };
}

export type PersonRepository = ReturnType<typeof personRepository>;
