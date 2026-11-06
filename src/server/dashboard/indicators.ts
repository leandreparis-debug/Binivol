import { Prisma } from "@/generated/prisma/client";
import { parseIndicators, type DashboardIndicator } from "@/lib/indicators";
import type { DbOrTx } from "../db";

/**
 * SQL of the DLUS indicators (step 16, docs/tableaux-de-bord.md), on
 * `persons p`. The same condition filters the directory
 * (`/benevoles?indicateur=KEY`) and counts the dashboard figure, after the
 * directory's own conditions (visibility first): same filter, same total.
 *
 * - « Présent actif » = status ACTIVE (paused and suspended people are not
 *   counted in the operational strength);
 * - a valid training = PASSED, not cancelled, not expired on the day (the
 *   rule of the perimeters, `perimeterSql`);
 * - an enrolment = REGISTERED, not cancelled, in a session not cancelled and
 *   not finished yet (end date, or start date, on or after the day), or
 *   without session and dated on or after the day (or undated).
 */

/** The setting `DASHBOARD_INDICATORS` (the defaults when absent). */
export async function loadIndicators(db: DbOrTx): Promise<readonly DashboardIndicator[]> {
  const row = await db.setting.findUnique({ where: { key: "DASHBOARD_INDICATORS" } });
  return parseIndicators(row?.value);
}

function validSql(codes: readonly string[], day: Date, obtainedBy?: Date): Prisma.Sql {
  const obtained = obtainedBy
    ? Prisma.sql`AND (tr.date IS NULL OR tr.date <= ${obtainedBy}::date)`
    : Prisma.empty;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM training_records tr
    JOIN reference_items ri ON ri.id = tr.reference_id
    WHERE tr.person_id = p.id AND ri.code = ANY(${[...codes]}::text[])
      AND tr.result = 'PASSED'::"TrainingResult" AND tr.cancelled_at IS NULL
      AND (tr.expires_at IS NULL OR tr.expires_at >= ${day}::date) ${obtained}
  )`;
}

function enrolledSql(codes: readonly string[], day: Date, createdBy?: Date): Prisma.Sql {
  const created = createdBy ? Prisma.sql`AND tr.created_at <= ${createdBy}` : Prisma.empty;
  return Prisma.sql`EXISTS (
    SELECT 1 FROM training_records tr
    JOIN reference_items ri ON ri.id = tr.reference_id
    LEFT JOIN training_sessions ts ON ts.id = tr.session_id
    WHERE tr.person_id = p.id AND ri.code = ANY(${[...codes]}::text[])
      AND tr.result = 'REGISTERED'::"TrainingResult" AND tr.cancelled_at IS NULL ${created}
      AND (
        (ts.id IS NOT NULL AND ts.cancelled_at IS NULL
          AND coalesce(ts.end_date, ts.start_date) >= ${day}::date)
        OR (ts.id IS NULL AND (tr.date IS NULL OR tr.date >= ${day}::date))
      )
  )`;
}

/** The people counted by the indicator today. */
export function indicatorSql(def: DashboardIndicator, day: Date): Prisma.Sql {
  const holds = def.kind === "valid" ? validSql(def.required, day) : enrolledSql(def.required, day);
  const excluded =
    def.excluded.length > 0 ? Prisma.sql`AND NOT ${validSql(def.excluded, day)}` : Prisma.empty;
  return Prisma.sql`(p.status = 'ACTIVE'::"PersonStatus" AND ${holds} ${excluded})`;
}

/**
 * The same people on a past day, for the 12-month variation. Statuses are not
 * historised: a volunteer is counted if she had entered and not left by then
 * (an approximation: a pause of that time is not known).
 */
export function indicatorPastSql(def: DashboardIndicator, past: Date): Prisma.Sql {
  const holds =
    def.kind === "valid"
      ? validSql(def.required, past, past)
      : enrolledSql(def.required, past, past);
  const excluded =
    def.excluded.length > 0
      ? Prisma.sql`AND NOT ${validSql(def.excluded, past, past)}`
      : Prisma.empty;
  return Prisma.sql`(p.entry_date IS NOT NULL AND p.entry_date <= ${past}::date
    AND (p.left_at IS NULL OR p.left_at > ${past}::date)
    AND ${holds} ${excluded})`;
}

/**
 * Counted today, but every valid training that makes them count expires
 * within `alertDays` days (« qui expirent sous 60 jours »). `valid` only.
 */
export function expiringSql(def: DashboardIndicator, day: Date, alertDays: number): Prisma.Sql {
  const limit = new Date(day.getTime() + alertDays * 86_400_000);
  return Prisma.sql`(${indicatorSql(def, day)} AND NOT EXISTS (
    SELECT 1 FROM training_records tr
    JOIN reference_items ri ON ri.id = tr.reference_id
    WHERE tr.person_id = p.id AND ri.code = ANY(${[...def.required]}::text[])
      AND tr.result = 'PASSED'::"TrainingResult" AND tr.cancelled_at IS NULL
      AND (tr.expires_at IS NULL OR tr.expires_at > ${limit}::date)
  ))`;
}

/** Counted today and holding one of the detail codes (« dont PSE2 »). */
export function detailSql(def: DashboardIndicator, day: Date): Prisma.Sql | null {
  if (!def.detail) return null;
  return Prisma.sql`(${indicatorSql(def, day)} AND ${validSql(def.detail.codes, day)})`;
}
