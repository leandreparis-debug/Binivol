/**
 * Rules of the reference list (trainings and functions).
 *
 * Convention: `expiresAt` is the **last day of validity**. A qualification is
 * valid on day D when `expiresAt` is null or `expiresAt >= D`.
 */

export interface ValidityRule {
  /** Validity in months after obtention, or null. */
  validityMonths: number | null;
  /** The expiry falls on 31 December. */
  expiresEndOfYear: boolean;
}

/** Adds months to a UTC date, clamping to the end of the month (31/01 + 1 → 28 or 29/02). */
export function addMonthsUtc(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
}

/**
 * Computes the expiry of a training from its reference item.
 *
 * - no obtention date → `null` (unknown, frequent in the legacy workbook);
 * - neither `validityMonths` nor `expiresEndOfYear` → `null` (never expires);
 * - `validityMonths` only → obtention + N months;
 * - `expiresEndOfYear` only → 31 December of the obtention year (a December
 *   obtention therefore expires the same month);
 * - both → 31 December of the year reached after N months.
 *
 * Dates are calendar days at 00:00 UTC, like Prisma `@db.Date` values.
 */
export function computeExpiresAt(
  rule: ValidityRule,
  obtainedAt: Date | null | undefined,
): Date | null {
  if (!obtainedAt || Number.isNaN(obtainedAt.getTime())) return null;
  if (rule.validityMonths === null && !rule.expiresEndOfYear) return null;
  let expiry = new Date(
    Date.UTC(obtainedAt.getUTCFullYear(), obtainedAt.getUTCMonth(), obtainedAt.getUTCDate()),
  );
  if (rule.validityMonths !== null) expiry = addMonthsUtc(expiry, rule.validityMonths);
  if (rule.expiresEndOfYear) expiry = new Date(Date.UTC(expiry.getUTCFullYear(), 11, 31));
  return expiry;
}

/** True when a qualification with this expiry is still valid on `day` (00:00 UTC). */
export function isValidOn(expiresAt: Date | null, day: Date): boolean {
  return expiresAt === null || expiresAt.getTime() >= day.getTime();
}
