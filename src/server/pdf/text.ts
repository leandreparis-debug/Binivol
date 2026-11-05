/**
 * Small pure helpers of the PDF filling: date parts in Paris, and fitting a
 * text into a field (smaller font, then clean truncation, never overflowing).
 */

const TIME_ZONE = "Europe/Paris";

/** `{ jour: "05", mois: "11", annee: "2026" }` of an instant, in Paris. */
export function parisDateParts(date: Date): { jour: string; mois: string; annee: string } {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { jour: get("day"), mois: get("month"), annee: get("year") };
}

/** Same parts from a calendar day `AAAA-MM-JJ` (birth date: no time zone). */
export function isoDayParts(iso: string | undefined): {
  jour: string;
  mois: string;
  annee: string;
} {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  return m
    ? { jour: m[3] ?? "", mois: m[2] ?? "", annee: m[1] ?? "" }
    : { jour: "", mois: "", annee: "" };
}

/** `JJ/MM/AAAA` in Paris. */
export function parisDay(date: Date): string {
  const { jour, mois, annee } = parisDateParts(date);
  return `${jour}/${mois}/${annee}`;
}

export interface FitOptions {
  /** Available width, in points. */
  width: number;
  /** Preferred size (the template's), and the smallest acceptable one. */
  maxSize: number;
  minSize: number;
}

/**
 * Fits `text` into a single-line field: keeps the preferred size when it fits,
 * else reduces the size down to `minSize`, else truncates with « … » at
 * `minSize`. `measure(text, size)` returns the width in points.
 */
export function fitText(
  text: string,
  measure: (text: string, size: number) => number,
  options: FitOptions,
): { text: string; size: number; truncated: boolean } {
  const value = text.replace(/\s+/g, " ").trim();
  for (let size = options.maxSize; size >= options.minSize; size -= 0.5) {
    if (measure(value, size) <= options.width) return { text: value, size, truncated: false };
  }
  const size = options.minSize;
  let cut = value;
  while (cut.length > 0 && measure(`${cut}…`, size) > options.width) cut = cut.slice(0, -1);
  return { text: cut.length > 0 ? `${cut.trimEnd()}…` : "", size, truncated: true };
}
