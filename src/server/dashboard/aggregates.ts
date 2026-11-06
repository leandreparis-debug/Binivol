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
