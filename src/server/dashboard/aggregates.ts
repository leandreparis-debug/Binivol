import type { CandidacyStage } from "@/generated/prisma/enums";
import { addMonthsUtc } from "../reference";

/**
 * Pure aggregates of the dashboards (step 13): recruitment funnel, retention
 * cohorts, monthly arrivals and departures. Tested without a database.
 */

const DAY = 86_400_000;

export interface FunnelCandidacy {
  stage: CandidacyStage;
  createdAt: Date;
  closedAt: Date | null;
  /** Stage changes, any order. */
  events: { at: Date; toStage: CandidacyStage }[];
}

export interface FunnelStep {
  stage: CandidacyStage;
  /** Open candidacies currently at this stage. */
  count: number;
  /** Average days spent at this stage (finished passages and the current one), null if none. */
  averageDays: number | null;
}

/**
 * Candidates per open stage and the average time spent at each stage. A
 * passage starts when the candidacy enters the stage (creation for the first
 * one) and ends at the next change (or `day` while it is still there).
 */
export function recruitmentFunnel(
  candidacies: readonly FunnelCandidacy[],
  stages: readonly CandidacyStage[],
  day: Date,
): FunnelStep[] {
  const durations = new Map<CandidacyStage, number[]>();
  const counts = new Map<CandidacyStage, number>();
  for (const c of candidacies) {
    if (c.closedAt === null) counts.set(c.stage, (counts.get(c.stage) ?? 0) + 1);
    const events = [...c.events].sort((a, b) => a.at.getTime() - b.at.getTime());
    // Passages: (stage, from, to).
    let current: CandidacyStage =
      events[0] && events[0].at.getTime() <= c.createdAt.getTime()
        ? events[0].toStage
        : "FIRST_CONTACT";
    let since = c.createdAt;
    for (const e of events) {
      if (e.at.getTime() <= c.createdAt.getTime()) continue;
      const list = durations.get(current) ?? [];
      list.push((e.at.getTime() - since.getTime()) / DAY);
      durations.set(current, list);
      current = e.toStage;
      since = e.at;
    }
    if (c.closedAt === null) {
      const list = durations.get(current) ?? [];
      list.push((day.getTime() - since.getTime()) / DAY);
      durations.set(current, list);
    }
  }
  return stages.map((stage) => {
    const list = durations.get(stage) ?? [];
    return {
      stage,
      count: counts.get(stage) ?? 0,
      averageDays:
        list.length === 0
          ? null
          : Math.round(list.reduce((s, v) => s + Math.max(0, v), 0) / list.length),
    };
  });
}

export interface CohortPerson {
  entryDate: Date | null;
  leftAt: Date | null;
}

export interface Cohort {
  /** « T1 2025 ». */
  label: string;
  entered: number;
  /** Still there 12 months after their entry. */
  retained: number;
  /** Percentage, rounded; null when nobody entered. */
  rate: number | null;
}

const quarterOf = (d: Date) => Math.floor(d.getUTCMonth() / 3);

/**
 * Retention by quarterly cohort: among the people who entered in a quarter,
 * the share still present 12 months after their own entry. Only the cohorts
 * whose 12 months are over (the last `count` of them).
 */
export function retentionCohorts(people: readonly CohortPerson[], day: Date, count = 8): Cohort[] {
  // Last quarter whose every entry is at least 12 months old.
  const limit = addMonthsUtc(day, -12);
  let year = limit.getUTCFullYear();
  let quarter = quarterOf(limit) - 1;
  if (quarter < 0) {
    quarter = 3;
    year -= 1;
  }
  const cohorts: Cohort[] = [];
  for (let i = 0; i < count; i += 1) {
    const start = new Date(Date.UTC(year, quarter * 3, 1));
    const end = new Date(Date.UTC(year, quarter * 3 + 3, 1));
    const members = people.filter((p) => p.entryDate && p.entryDate >= start && p.entryDate < end);
    const retained = members.filter((p) => {
      if (!p.entryDate) return false;
      const oneYear = addMonthsUtc(p.entryDate, 12);
      return p.leftAt === null || p.leftAt.getTime() >= oneYear.getTime();
    }).length;
    cohorts.unshift({
      label: `T${String(quarter + 1)} ${String(year)}`,
      entered: members.length,
      retained,
      rate: members.length === 0 ? null : Math.round((retained / members.length) * 100),
    });
    quarter -= 1;
    if (quarter < 0) {
      quarter = 3;
      year -= 1;
    }
  }
  return cohorts;
}

const MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

export interface MonthlyFlow {
  /** « nov. 2026 ». */
  label: string;
  arrivals: number;
  departures: number;
}

/** Arrivals (entry date) and departures (departure date) per month, the last 12 months. */
export function monthlyFlows(people: readonly CohortPerson[], day: Date): MonthlyFlow[] {
  const months: MonthlyFlow[] = [];
  for (let i = 11; i >= 0; i -= 1) {
    const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const inMonth = (d: Date | null) => d !== null && d >= start && d < end;
    months.push({
      label: `${MONTHS[start.getUTCMonth()] ?? ""} ${String(start.getUTCFullYear())}`,
      arrivals: people.filter((p) => inMonth(p.entryDate)).length,
      departures: people.filter((p) => inMonth(p.leftAt)).length,
    });
  }
  return months;
}

// ---------------------------------------------------------------------------
// DLUS dashboard (step 16): periods, arrivals by month, median, activities
// ---------------------------------------------------------------------------

export const ARRIVAL_PERIODS = ["12mois", "annee", "precedente"] as const;
export type ArrivalPeriod = (typeof ARRIVAL_PERIODS)[number];

export const ARRIVAL_PERIOD_LABELS: Record<ArrivalPeriod, string> = {
  "12mois": "12 mois glissants",
  annee: "Année civile",
  precedente: "Année précédente",
};

/** The 12 months of a period: rolling (ending with the current month), this year, last year. */
export function periodMonths(period: ArrivalPeriod, day: Date): { start: Date; end: Date }[] {
  const year = day.getUTCFullYear();
  const first =
    period === "12mois"
      ? new Date(Date.UTC(year, day.getUTCMonth() - 11, 1))
      : new Date(Date.UTC(period === "annee" ? year : year - 1, 0, 1));
  return Array.from({ length: 12 }, (_, i) => {
    const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + i, 1));
    return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)) };
  });
}

export interface PeriodFlow extends MonthlyFlow {
  /** The month of `day` (shown in accent). */
  current: boolean;
  balance: number;
}

/** Arrivals (entry date), departures (left date) and balance per month of the period. */
export function periodFlows(
  people: readonly CohortPerson[],
  period: ArrivalPeriod,
  day: Date,
): PeriodFlow[] {
  return periodMonths(period, day).map(({ start, end }) => {
    const inMonth = (d: Date | null) => d !== null && d >= start && d < end;
    const arrivals = people.filter((p) => inMonth(p.entryDate)).length;
    const departures = people.filter((p) => inMonth(p.leftAt)).length;
    return {
      label: `${MONTHS[start.getUTCMonth()] ?? ""} ${String(start.getUTCFullYear())}`,
      arrivals,
      departures,
      balance: arrivals - departures,
      current: day >= start && day < end,
    };
  });
}

/** Median of a list (null when empty), rounded to the day. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 1
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round(value);
}

export const ARRIVAL_ACTIVITIES = ["secours", "urgence", "formation", "autre"] as const;
export type ArrivalActivity = (typeof ARRIVAL_ACTIVITIES)[number];

export const ARRIVAL_ACTIVITY_LABELS: Record<ArrivalActivity, string> = {
  secours: "Secours",
  urgence: "Urgence",
  formation: "Formation",
  autre: "Autre",
};

/**
 * The activity of a newcomer: her first training with a perimeter (ACTION →
 * secours, LASER → urgence, FORMAT_GP → formation), otherwise the first of
 * her wished activities whose words say it, otherwise « autre ».
 */
export function arrivalActivity(person: {
  firstTrainingPerimeters: readonly string[];
  wishedActivities: readonly string[];
}): ArrivalActivity {
  const fromPerimeter = (p: string): ArrivalActivity | null =>
    p === "ACTION" ? "secours" : p === "LASER" ? "urgence" : p === "FORMAT_GP" ? "formation" : null;
  for (const p of person.firstTrainingPerimeters) {
    const a = fromPerimeter(p);
    if (a) return a;
  }
  for (const label of person.wishedActivities) {
    const l = label.toLowerCase();
    if (l.includes("secour")) return "secours";
    if (l.includes("urgence")) return "urgence";
    if (l.includes("formation")) return "formation";
  }
  return "autre";
}
