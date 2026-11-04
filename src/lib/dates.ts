/**
 * Date formatting helpers. Everything is rendered in French, in the
 * `Europe/Paris` time zone, whatever the server's own time zone.
 */

export const TIME_ZONE = "Europe/Paris";
const LOCALE = "fr-FR";

/** Placeholder rendered for missing or invalid values. */
export const EMPTY_VALUE = "—";

type DateInput = Date | string | number | null | undefined;

/**
 * Converts an input into a valid `Date`, or `null` when it is missing or invalid.
 */
export function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Formats a date as `JJ/MM/AAAA` in the Paris time zone.
 * Returns « — » for `null`, `undefined` or an invalid date.
 */
export function formatDate(input: DateInput): string {
  const date = toDate(input);
  return date ? dateFormatter.format(date) : EMPTY_VALUE;
}

/**
 * Formats a date and time as `JJ/MM/AAAA HH:MM` in the Paris time zone.
 * Returns « — » for `null`, `undefined` or an invalid date.
 */
export function formatDateTime(input: DateInput): string {
  const date = toDate(input);
  return date ? dateTimeFormatter.format(date).replace(",", "") : EMPTY_VALUE;
}

/**
 * Returns the calendar day (in the Paris time zone) of a date as `AAAA-MM-JJ`.
 * Used to count whole days regardless of daylight-saving transitions.
 */
function parisDayKey(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * Number of calendar days (Paris time zone) between `from` and `to`.
 * Positive when `to` is after `from`. DST changes do not shift the result
 * because the count is done on calendar days, not on 24 h slices.
 */
export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(...splitKey(parisDayKey(from)));
  const b = Date.UTC(...splitKey(parisDayKey(to)));
  return Math.round((b - a) / 86_400_000);
}

/**
 * The calendar day of `now` in Paris, as a `Date` at 00:00 UTC — the same
 * shape Prisma uses for `@db.Date` columns, so the two compare directly.
 */
export function toParisDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(...splitKey(parisDayKey(now))));
}

function splitKey(key: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return [y, m - 1, d];
}

/**
 * Formats a date relative to `now` in French: « aujourd'hui », « demain »,
 * « hier », « dans 58 jours », « il y a 5 jours ».
 * Returns « — » for `null`, `undefined` or an invalid date.
 */
export function formatRelative(input: DateInput, now: Date = new Date()): string {
  const date = toDate(input);
  if (!date) return EMPTY_VALUE;
  const diff = daysBetween(now, date);
  if (diff === 0) return "aujourd'hui";
  if (diff === 1) return "demain";
  if (diff === -1) return "hier";
  const abs = Math.abs(diff);
  const unit = abs === 1 ? "jour" : "jours";
  return diff > 0 ? `dans ${abs} ${unit}` : `il y a ${abs} ${unit}`;
}
