import type { DeadlineStatus } from "./status";

/**
 * Classification of a validity deadline (training, annex competence,
 * document). Client-safe and pure: `day` and `expiresAt` are calendar days
 * at 00:00 UTC (Prisma `@db.Date`), `expiresAt` being the last valid day.
 */

/** `none`: no known deadline (no expiry, or obtention date unknown). */
export type DeadlineClass = DeadlineStatus | "none";

const DAY_MS = 86_400_000;

/**
 * - `none` when `expiresAt` is null;
 * - `expired` when the last valid day is before `day`;
 * - `soon` when it falls within the next `alertDays` days (inclusive);
 * - `ok` otherwise.
 */
export function classifyDeadline(
  expiresAt: Date | null | undefined,
  day: Date,
  alertDays: number,
): DeadlineClass {
  if (!expiresAt) return "none";
  const diff = Math.round((expiresAt.getTime() - day.getTime()) / DAY_MS);
  if (diff < 0) return "expired";
  if (diff <= alertDays) return "soon";
  return "ok";
}

/** French label of a deadline class (always shown next to the dot). */
export const DEADLINE_CLASS_LABELS: Record<DeadlineClass, string> = {
  ok: "À jour",
  soon: "Échéance proche",
  expired: "Expirée",
  none: "Sans date",
};

/** Ranks classes from the most to the least urgent (sorting). */
export const DEADLINE_URGENCY: Record<DeadlineClass, number> = {
  expired: 0,
  soon: 1,
  ok: 2,
  none: 3,
};
