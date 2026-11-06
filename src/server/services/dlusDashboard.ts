import { Prisma } from "@/generated/prisma/client";
import type { CandidacyStage } from "@/generated/prisma/enums";
import { formatDate, toParisDay } from "@/lib/dates";
import type { DashboardIndicator } from "@/lib/indicators";
import { OPEN_STAGES } from "../candidacy/machine";
import {
  ARRIVAL_ACTIVITIES,
  arrivalActivity,
  median,
  periodFlows,
  retentionCohorts,
  type ArrivalActivity,
  type ArrivalPeriod,
  type Cohort,
  type PeriodFlow,
} from "../dashboard/aggregates";
import { detailSql, expiringSql, indicatorPastSql, loadIndicators } from "../dashboard/indicators";
import type { DbOrTx } from "../db";
import { authorize, personPageAccess } from "../policy/can";
import { loadPersonFactsMany } from "../policy/facts";
import type { Actor } from "../policy/types";
import { directoryVisibilitySql, visibleSql, type VisibilityContext } from "../policy/visibility";
import { addMonthsUtc } from "../reference";
import { numericSettings } from "../settings";
import { directoryConditions, directoryQuerySchema } from "./directory";

/**
 * The DLUS dashboard (TOPAZE home page, step 16, docs/tableaux-de-bord.md):
 * operational strength, latest enrolments, arrivals. Everything is counted
 * in SQL after `visibleSql()`, without any sensitive data. Each indicator is
 * counted with **the directory's own conditions** (`directoryConditions` with
 * `indicateur`): the figure and the list it opens always agree.
 */

export interface IndicatorFigure {
  key: string;
  label: string;
  value: number;
  /** The directory filtered on the people counted. */
  href: string;
  /** Value now minus value on `since` (12 months earlier). */
  variation: number;
  since: string;
  /** Counted today, but losing it within the alert window (`valid` only). */
  expiring: number | null;
  /** « dont PSE2 : n » when the reference list has the detail codes. */
  detail: { label: string; value: number } | null;
}

export type EnrolmentStatus = "REGISTERED" | "WAITLISTED" | "CONFIRMED";

export const ENROLMENT_STATUS_LABELS: Record<EnrolmentStatus, string> = {
  REGISTERED: "Inscrit",
  WAITLISTED: "Liste d'attente",
  CONFIRMED: "Confirmé",
};

export interface RecentEnrolment {
  id: string;
  at: Date;
  person: { name: string; ref: string | null };
  training: string;
  sessionDate: Date | null;
  status: EnrolmentStatus;
}

export interface ArrivalsZone {
  period: ArrivalPeriod;
  months: PeriodFlow[];
  arrivalsSinceJanuary: number;
  arrivalsLast12Months: number;
  /** Median days from the first contact to « bénévole » (candidacies done in 12 months). */
  medianDays: number | null;
  /** Done / (done + abandoned), candidacies closed in 12 months, in %. */
  conversionRate: number | null;
  funnel: { stage: CandidacyStage; count: number; href: string }[];
  byActivity: { activity: ArrivalActivity; count: number }[];
  cohorts: Cohort[];
}

export interface DlusDashboard {
  indicators: IndicatorFigure[];
  enrolments: RecentEnrolment[];
  arrivals: ArrivalsZone;
}

const DEFAULT_QUERY = directoryQuerySchema.parse({});

/** The figure of one indicator, with the directory's conditions (same filter, same total). */
async function indicatorFigure(
  db: DbOrTx,
  actor: Actor,
  def: DashboardIndicator,
  ctx: VisibilityContext & { alertDays: number; indicators: readonly DashboardIndicator[] },
  knownCodes: ReadonlySet<string>,
): Promise<IndicatorFigure> {
  const listed = Prisma.join(
    directoryConditions(actor, { ...DEFAULT_QUERY, indicateur: def.key }, ctx),
    " AND ",
  );
  const past = addMonthsUtc(ctx.day, -12);
  const base = Prisma.sql`${directoryVisibilitySql(actor, ctx)} AND p.archived_at IS NULL`;
  const detail = def.detail?.codes.every((c) => knownCodes.has(c)) ? detailSql(def, ctx.day) : null;
  const [row] = await db.$queryRaw<
    { value: bigint; past: bigint; expiring: bigint; detail: bigint }[]
  >`
    SELECT
      count(*) FILTER (WHERE ${listed}) AS value,
      count(*) FILTER (WHERE ${base} AND ${indicatorPastSql(def, past)}) AS past,
      count(*) FILTER (WHERE ${listed} AND ${expiringSql(def, ctx.day, ctx.alertDays)}) AS expiring,
      count(*) FILTER (WHERE ${listed} AND ${detail ?? Prisma.sql`FALSE`}) AS detail
    FROM persons p`;
  const value = Number(row?.value ?? 0);
  return {
    key: def.key,
    label: def.label,
    value,
    href: `/benevoles?indicateur=${def.key}`,
    variation: value - Number(row?.past ?? 0),
    since: formatDate(past),
    expiring: def.kind === "valid" ? Number(row?.expiring ?? 0) : null,
    detail:
      detail && def.detail ? { label: def.detail.label, value: Number(row?.detail ?? 0) } : null,
  };
}

/** The 10 latest enrolments (registrations, waiting lists) of people the actor sees. */
async function recentEnrolments(
  db: DbOrTx,
  actor: Actor,
  ctx: VisibilityContext,
  limit = 10,
): Promise<RecentEnrolment[]> {
  const visible = visibleSql(actor, "training.read", ctx);
  const [records, wishes] = await Promise.all([
    db.$queryRaw<
      {
        id: string;
        at: Date;
        person_id: string;
        session_id: string | null;
        label: string;
        session_date: Date | null;
        confirmed: boolean;
      }[]
    >`
      SELECT tr.id, tr.created_at AS at, tr.person_id, tr.session_id, ri.label,
        ts.start_date AS session_date,
        EXISTS (
          SELECT 1 FROM training_wishes w
          WHERE w.person_id = tr.person_id AND w.session_id = tr.session_id
            AND w.status = 'SCHEDULED'::"TrainingWishStatus"
        ) AS confirmed
      FROM training_records tr
      JOIN reference_items ri ON ri.id = tr.reference_id
      JOIN persons p ON p.id = tr.person_id
      LEFT JOIN training_sessions ts ON ts.id = tr.session_id
      WHERE tr.result = 'REGISTERED'::"TrainingResult" AND tr.cancelled_at IS NULL
        AND p.archived_at IS NULL AND ${visible}
      ORDER BY tr.created_at DESC, tr.id
      LIMIT ${limit}`,
    db.$queryRaw<
      { id: string; at: Date; person_id: string; label: string; session_date: Date | null }[]
    >`
      SELECT w.id, w.updated_at AS at, w.person_id, ri.label, ts.start_date AS session_date
      FROM training_wishes w
      JOIN reference_items ri ON ri.id = w.reference_id
      JOIN persons p ON p.id = w.person_id
      LEFT JOIN training_sessions ts ON ts.id = w.session_id
      WHERE w.status = 'WAITLISTED'::"TrainingWishStatus"
        AND p.archived_at IS NULL AND ${visible}
      ORDER BY w.updated_at DESC, w.id
      LIMIT ${limit}`,
  ]);
  interface Row {
    id: string;
    at: Date;
    personId: string;
    training: string;
    sessionDate: Date | null;
    status: EnrolmentStatus;
  }
  const rows: Row[] = [
    ...records.map((r): Row => ({
      id: r.id,
      at: r.at,
      personId: r.person_id,
      training: r.label,
      sessionDate: r.session_date,
      status: r.confirmed ? "CONFIRMED" : "REGISTERED",
    })),
    ...wishes.map((w): Row => ({
      id: w.id,
      at: w.at,
      personId: w.person_id,
      training: w.label,
      sessionDate: w.session_date,
      status: "WAITLISTED",
    })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
  const ids = [...new Set(rows.map((r) => r.personId))];
  const [people, facts] = await Promise.all([
    db.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, ref: true, firstName: true, lastName: true, usageName: true },
    }),
    loadPersonFactsMany(db, ids, ctx.day, ctx.newVolunteerMonths),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  return rows.map((r) => {
    const p = byId.get(r.personId);
    const f = facts.get(r.personId);
    return {
      id: r.id,
      at: r.at,
      person: {
        name: p ? `${p.firstName} ${(p.usageName ?? p.lastName).toLocaleUpperCase("fr-FR")}` : "—",
        ref: p && f && personPageAccess(actor, f) !== null ? p.ref : null,
      },
      training: r.training,
      sessionDate: r.sessionDate,
      status: r.status,
    };
  });
}

/** Arrivals, departures, conversion, funnel, activities and cohorts, over visible people. */
async function arrivals(
  db: DbOrTx,
  actor: Actor,
  ctx: VisibilityContext,
  period: ArrivalPeriod,
): Promise<ArrivalsZone> {
  const { day } = ctx;
  const visible = visibleSql(actor, "person.directory.read", ctx);
  const people = await db.$queryRaw<
    { id: string; entry_date: Date | null; left_at: Date | null }[]
  >`
    SELECT p.id, p.entry_date, p.left_at FROM persons p
    WHERE ${visible} AND p.archived_at IS NULL
      AND (p.entry_date IS NOT NULL OR p.left_at IS NOT NULL)`;
  const flows = people.map((p) => ({ entryDate: p.entry_date, leftAt: p.left_at }));
  const yearStart = new Date(Date.UTC(day.getUTCFullYear(), 0, 1));
  const since12 = addMonthsUtc(day, -12);
  const arrived12 = people.filter(
    (p) => p.entry_date && p.entry_date > since12 && p.entry_date <= day,
  );

  const ids = people.map((p) => p.id);
  const [candidacies, open, firstTrainings, wished] = await Promise.all([
    db.candidacy.findMany({
      where: {
        personId: { in: ids },
        stage: { in: ["DONE", "ABANDONED"] },
        closedAt: { gt: since12, lte: new Date(day.getTime() + 86_400_000) },
      },
      select: { stage: true, firstContactAt: true, createdAt: true, closedAt: true },
    }),
    db.$queryRaw<{ stage: CandidacyStage; n: bigint }[]>`
      SELECT c.stage, count(*) AS n FROM candidacies c
      JOIN persons p ON p.id = c.person_id
      WHERE c.closed_at IS NULL AND p.archived_at IS NULL
        AND ${visibleSql(actor, "candidacy.manage", ctx)}
      GROUP BY c.stage`,
    db.$queryRaw<{ person_id: string; perimeters: string[] }[]>`
      SELECT DISTINCT ON (tr.person_id) tr.person_id, ri.perimeters::text[] AS perimeters
      FROM training_records tr JOIN reference_items ri ON ri.id = tr.reference_id
      WHERE tr.person_id = ANY(${arrived12.map((p) => p.id)}::text[])
        AND tr.result = 'PASSED'::"TrainingResult" AND tr.cancelled_at IS NULL
        AND cardinality(ri.perimeters) > 0
      ORDER BY tr.person_id, tr.date NULLS LAST, tr.created_at`,
    db.personWishedActivity.findMany({
      where: { personId: { in: arrived12.map((p) => p.id) } },
      orderBy: { createdAt: "asc" },
      select: { personId: true, label: true },
    }),
  ]);
  const done = candidacies.filter((c) => c.stage === "DONE");
  const delays = done.flatMap((c) =>
    c.closedAt
      ? [(c.closedAt.getTime() - (c.firstContactAt ?? c.createdAt).getTime()) / 86_400_000]
      : [],
  );
  const perimetersOf = new Map(firstTrainings.map((t) => [t.person_id, t.perimeters]));
  const activityCount = new Map<ArrivalActivity, number>();
  for (const p of arrived12) {
    const activity = arrivalActivity({
      firstTrainingPerimeters: perimetersOf.get(p.id) ?? [],
      wishedActivities: wished.filter((w) => w.personId === p.id).map((w) => w.label),
    });
    activityCount.set(activity, (activityCount.get(activity) ?? 0) + 1);
  }
  const openByStage = new Map(open.map((o) => [o.stage, Number(o.n)]));
  return {
    period,
    months: periodFlows(flows, period, day),
    arrivalsSinceJanuary: people.filter(
      (p) => p.entry_date && p.entry_date >= yearStart && p.entry_date <= day,
    ).length,
    arrivalsLast12Months: arrived12.length,
    medianDays: median(delays),
    conversionRate:
      candidacies.length === 0 ? null : Math.round((done.length / candidacies.length) * 100),
    funnel: OPEN_STAGES.map((stage) => ({
      stage,
      count: openByStage.get(stage) ?? 0,
      href: `/candidats?etape=${stage}`,
    })),
    byActivity: ARRIVAL_ACTIVITIES.map((activity) => ({
      activity,
      count: activityCount.get(activity) ?? 0,
    })),
    cohorts: retentionCohorts(flows, day),
  };
}

/** The whole DLUS dashboard (`dashboard.dlus.read`: TOPAZE). */
export async function dlusDashboard(
  db: DbOrTx,
  actor: Actor,
  options: { day?: Date; period?: ArrivalPeriod } = {},
): Promise<DlusDashboard> {
  authorize(actor, "dashboard.dlus.read");
  const day = options.day ?? toParisDay();
  const settings = await numericSettings(db);
  const indicators = await loadIndicators(db);
  const ctx = {
    day,
    newVolunteerMonths: settings.newVolunteerMonths,
    alertDays: settings.alertDays,
    indicators,
  };
  const codes = new Set(
    (await db.referenceItem.findMany({ select: { code: true } })).map((r) => r.code),
  );
  const [figures, enrolments, zone] = await Promise.all([
    Promise.all(indicators.map((def) => indicatorFigure(db, actor, def, ctx, codes))),
    recentEnrolments(db, actor, ctx),
    arrivals(db, actor, ctx, options.period ?? "12mois"),
  ]);
  return { indicators: figures, enrolments, arrivals: zone };
}

/**
 * Settings preview (« Aperçu » before saving `DASHBOARD_INDICATORS`): the
 * number each typed definition would give today, with the directory's
 * conditions. TOPAZE (`setting.manage`).
 */
export async function previewIndicators(
  db: DbOrTx,
  actor: Actor,
  defs: readonly DashboardIndicator[],
  day: Date = toParisDay(),
): Promise<{ key: string; label: string; value: number }[]> {
  authorize(actor, "setting.manage");
  const settings = await numericSettings(db);
  const ctx = {
    day,
    newVolunteerMonths: settings.newVolunteerMonths,
    alertDays: settings.alertDays,
    indicators: defs,
  };
  return Promise.all(
    defs.map(async (def) => {
      const where = Prisma.join(
        directoryConditions(actor, { ...DEFAULT_QUERY, indicateur: def.key }, ctx),
        " AND ",
      );
      const [row] = await db.$queryRaw<
        { n: bigint }[]
      >`SELECT count(*) AS n FROM persons p WHERE ${where}`;
      return { key: def.key, label: def.label, value: Number(row?.n ?? 0) };
    }),
  );
}

/**
 * « Tout voir » of the latest enrolments (`/formations/sessions?inscriptions=recentes`):
 * the same list, longer. People the actor sees only (`training.read`).
 */
export async function listRecentEnrolments(
  db: DbOrTx,
  actor: Actor,
  limit = 50,
): Promise<RecentEnrolment[]> {
  const settings = await numericSettings(db);
  return recentEnrolments(
    db,
    actor,
    { day: toParisDay(), newVolunteerMonths: settings.newVolunteerMonths },
    limit,
  );
}
