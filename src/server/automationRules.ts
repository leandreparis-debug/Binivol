import type { DigestFrequency } from "./automationSettings";

/**
 * Calendar rules of the automatic e-mails (step 12). Pure, on Paris calendar
 * days (00:00 UTC).
 */

const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

/** The alert digest goes out on the 1st of the month (MONTHLY) or on Mondays (WEEKLY). */
export function digestDue(frequency: DigestFrequency, day: Date): boolean {
  if (frequency === "MONTHLY") return day.getUTCDate() === 1;
  if (frequency === "WEEKLY") return day.getUTCDay() === 1;
  return false;
}

/**
 * An anniversary of `date` falls on `day`: same month and day; 29 February
 * is celebrated on 28 February in a non-leap year.
 */
export function anniversaryOn(date: Date, day: Date): boolean {
  const month = date.getUTCMonth();
  const d = date.getUTCDate();
  if (month === day.getUTCMonth() && d === day.getUTCDate()) return true;
  return (
    month === 1 &&
    d === 29 &&
    day.getUTCMonth() === 1 &&
    day.getUTCDate() === 28 &&
    !isLeap(day.getUTCFullYear())
  );
}

/** Whole years between the entry date and `day` (anniversary of the engagement). */
export function engagementYears(entryDate: Date, day: Date): number {
  return day.getUTCFullYear() - entryDate.getUTCFullYear();
}
