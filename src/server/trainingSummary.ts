import type { ReferenceCategory, TrainingResult } from "@/generated/prisma/enums";
import { classifyDeadline, type DeadlineClass } from "@/lib/deadlines";

/**
 * Current state of a person's qualifications, from her training records.
 * Pure: shared by the directory (pills, next deadline) and the person page.
 *
 * Per reference, only PASSED and not cancelled records count. Its expiry is
 * the **latest known** `expiresAt` among them (a renewal replaces an older
 * one). A dated qualification without expiry (no validity rule) is « à jour »;
 * without any known date, the deadline is unknown (« sans date »). The deadline filters of the
 * directory apply the same rule in SQL (`deadlineSql`).
 */

export interface SummaryRecord {
  referenceId: string;
  code: string;
  label: string;
  category: ReferenceCategory;
  sortOrder: number;
  result: TrainingResult;
  date: Date | null;
  expiresAt: Date | null;
  cancelledAt: Date | null;
}

export interface QualificationState {
  referenceId: string;
  code: string;
  label: string;
  category: ReferenceCategory;
  sortOrder: number;
  /** Latest obtention date known, or null. */
  obtainedAt: Date | null;
  /** Latest known expiry, or null (no expiry, or unknown). */
  expiresAt: Date | null;
  deadline: DeadlineClass;
}

/** Qualifications held (PASSED, not cancelled), ordered by the reference list order. */
export function qualificationsOf(
  records: readonly SummaryRecord[],
  day: Date,
  alertDays: number,
): QualificationState[] {
  const byReference = new Map<string, QualificationState>();
  for (const record of records) {
    if (record.result !== "PASSED" || record.cancelledAt !== null) continue;
    const current = byReference.get(record.referenceId);
    const latest = (a: Date | null, b: Date | null) =>
      a === null ? b : b === null ? a : a.getTime() >= b.getTime() ? a : b;
    const expiresAt = latest(current?.expiresAt ?? null, record.expiresAt);
    const obtainedAt = latest(current?.obtainedAt ?? null, record.date);
    byReference.set(record.referenceId, {
      referenceId: record.referenceId,
      code: record.code,
      label: record.label,
      category: record.category,
      sortOrder: record.sortOrder,
      obtainedAt,
      expiresAt,
      // Known date and no expiry: a permanent qualification, up to date.
      deadline:
        expiresAt === null && obtainedAt !== null
          ? "ok"
          : classifyDeadline(expiresAt, day, alertDays),
    });
  }
  return [...byReference.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code),
  );
}

export interface DirectoryTrainingSummary {
  /** Codes of the first three valid qualifications (reference order). */
  qualifications: string[];
  /** Number of other valid qualifications (« +N »). */
  extra: number;
  /** The most urgent known deadline: the earliest expiry, past or future. */
  next: { code: string; expiresAt: Date; deadline: DeadlineClass } | null;
}

/** What the directory shows of the trainings of one person. */
export function directorySummary(states: readonly QualificationState[]): DirectoryTrainingSummary {
  const valid = states.filter((s) => s.deadline !== "expired");
  let next: DirectoryTrainingSummary["next"] = null;
  for (const state of states) {
    if (!state.expiresAt) continue;
    if (!next || state.expiresAt.getTime() < next.expiresAt.getTime()) {
      next = { code: state.code, expiresAt: state.expiresAt, deadline: state.deadline };
    }
  }
  return {
    qualifications: valid.slice(0, 3).map((s) => s.code),
    extra: Math.max(valid.length - 3, 0),
    next,
  };
}

/** Counts for the hatched bar of the Formations tab. */
export function deadlineCounts(
  states: readonly QualificationState[],
): Record<DeadlineClass, number> {
  const counts: Record<DeadlineClass, number> = { ok: 0, soon: 0, expired: 0, none: 0 };
  for (const state of states) counts[state.deadline] += 1;
  return counts;
}
