/**
 * Age helpers. Pure and client-safe: dates are calendar days at 00:00 UTC.
 */

export const MAJORITY_AGE = 18;

/** Age in whole years on `day`, or null when the birth date is unknown. */
export function ageOn(birthDate: Date | null | undefined, day: Date): number | null {
  if (!birthDate || Number.isNaN(birthDate.getTime())) return null;
  let age = day.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    day.getUTCMonth() < birthDate.getUTCMonth() ||
    (day.getUTCMonth() === birthDate.getUTCMonth() && day.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** True when the person is under 18 on `day`; false when the birth date is unknown. */
export function isMinorOn(birthDate: Date | null | undefined, day: Date): boolean {
  const age = ageOn(birthDate, day);
  return age !== null && age < MAJORITY_AGE;
}

/** Latest birth date of an adult on `day` (born on or before it → 18 or more). */
export function adultBornOnOrBefore(day: Date): Date {
  const year = day.getUTCFullYear() - MAJORITY_AGE;
  const month = day.getUTCMonth();
  // 29 February → 28 February when the target year is not a leap year.
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day.getUTCDate(), last)));
}

/** « 1 an », « 34 ans » ; empty for unknown. */
export function formatAge(age: number | null): string {
  if (age === null) return "";
  return age <= 1 ? `${String(age)} an` : `${String(age)} ans`;
}

/**
 * Seniority between `from` and `day`, in French: « 3 ans et 2 mois »,
 * « 5 mois », « moins d'un mois ». Empty when `from` is unknown or after `day`.
 */
export function formatSeniority(from: Date | null | undefined, day: Date): string {
  if (!from || from.getTime() > day.getTime()) return "";
  let months =
    (day.getUTCFullYear() - from.getUTCFullYear()) * 12 + day.getUTCMonth() - from.getUTCMonth();
  if (day.getUTCDate() < from.getUTCDate()) months -= 1;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years === 0 ? "" : years === 1 ? "1 an" : `${String(years)} ans`;
  const m = rest === 0 ? "" : `${String(rest)} mois`;
  if (!y && !m) return "moins d'un mois";
  return y && m ? `${y} et ${m}` : y || m;
}
