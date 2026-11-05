/**
 * Small pure helpers of the PDF filling: Paris date parts and text fitting.
 */

export interface DateParts {
  day: string;
  month: string;
  year: string;
}

/** `JJ`, `MM`, `AAAA` of an instant, in Europe/Paris. */
export function parisDateParts(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return { day: get("day"), month: get("month"), year: get("year") };
}

/** `JJ`, `MM`, `AAAA` of a calendar day written `AAAA-MM-JJ` (birth dates). */
export function isoDayParts(day: string | undefined): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day ?? "");
  if (!match) return null;
  return { year: match[1] ?? "", month: match[2] ?? "", day: match[3] ?? "" };
}

/** `JJ/MM/AAAA` in Europe/Paris. */
export function parisDayText(date: Date): string {
  const { day, month, year } = parisDateParts(date);
  return `${day}/${month}/${year}`;
}

export interface FittedText {
  text: string;
  size: number;
  /** True when the text had to be cut (with « … »). */
  truncated: boolean;
}

/**
 * Fits a single line in `width` points: the largest size from `max` down to
 * `min` (by half points) where it fits; below `min`, the text is cut and ends
 * with « … ». `measure` gives the width of a text at a size (the embedded font).
 */
export function fitText(
  text: string,
  width: number,
  measure: (text: string, size: number) => number,
  { max = 9, min = 6 }: { max?: number; min?: number } = {},
): FittedText {
  const value = text.replace(/\s+/g, " ").trim();
  for (let size = max; size >= min; size -= 0.5) {
    if (measure(value, size) <= width) return { text: value, size, truncated: false };
  }
  let cut = value;
  while (cut.length > 0 && measure(`${cut}…`, min) > width) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, size: min, truncated: true };
}

/**
 * Splits a text over two fields of the given widths (« Structure de
 * rattachement 1 / 2 »): as many whole words as fit in the first.
 */
export function splitOverTwo(
  text: string,
  firstWidth: number,
  measure: (text: string, size: number) => number,
  size: number,
): [string, string] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  let first = "";
  while (words.length > 0) {
    const candidate = first ? `${first} ${words[0] ?? ""}` : (words[0] ?? "");
    if (measure(candidate, size) > firstWidth) break;
    first = candidate;
    words.shift();
  }
  return [first, words.join(" ")];
}
