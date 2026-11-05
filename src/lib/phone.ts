/**
 * French phone numbers. Stored as digits only (`0612345678`), shown by pairs
 * (`06 12 34 56 78`). Client-safe.
 */

export interface PhoneParse {
  /** Normalised digits, or the input kept as written when it cannot be read. */
  value: string | null;
  /** False when the value was kept as written (the caller warns). */
  normalized: boolean;
}

/**
 * Normalises a phone number:
 * - a number of 9 digits starting with 1 to 9 (a spreadsheet dropped the
 *   leading 0, e.g. `612345678`) becomes `0` + those digits;
 * - a text with spaces, dots, dashes or a `+33` / `0033` prefix becomes the
 *   10-digit national form;
 * - anything else is kept as written, with `normalized: false`.
 *
 * @example parsePhone(612345678) // { value: "0612345678", normalized: true }
 * @example parsePhone("+33 6 12 34 56 78") // { value: "0612345678", normalized: true }
 */
export function parsePhone(input: string | number | null | undefined): PhoneParse {
  if (input === null || input === undefined) return { value: null, normalized: true };
  if (typeof input === "number") {
    if (Number.isInteger(input) && input >= 100_000_000 && input <= 999_999_999) {
      return { value: `0${String(input)}`, normalized: true };
    }
    return { value: String(input), normalized: false };
  }
  const written = input.replace(/[\s ]+/g, " ").trim();
  if (written === "") return { value: null, normalized: true };
  const compact = written.replace(/[\s.\-()/]/g, "");
  let national: string | null = null;
  if (/^\+33\d{9}$/.test(compact)) national = `0${compact.slice(3)}`;
  else if (/^0033\d{9}$/.test(compact)) national = `0${compact.slice(4)}`;
  else if (/^\+330\d{9}$/.test(compact)) national = compact.slice(3);
  else if (/^0[1-9]\d{8}$/.test(compact)) national = compact;
  else if (/^[1-9]\d{8}$/.test(compact)) national = `0${compact}`;
  return national ? { value: national, normalized: true } : { value: written, normalized: false };
}

/** Normalised digits, or the trimmed input when it is not a French number. */
export function normalizePhone(input: string | number | null | undefined): string | null {
  return parsePhone(input).value;
}

/** True when the value is a 10-digit French number (`0` + 9 digits). */
export function isNationalPhone(value: string): boolean {
  return /^0[1-9]\d{8}$/.test(value);
}

/**
 * Display form: `06 12 34 56 78` for a 10-digit number, the value as stored
 * otherwise, an empty string for null.
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return "";
  return isNationalPhone(value) ? value.replace(/(\d{2})(?=\d)/g, "$1 ") : value;
}

/** `tel:` link target (international form for a French number). */
export function phoneHref(value: string): string {
  return isNationalPhone(value) ? `tel:+33${value.slice(1)}` : `tel:${value.replace(/\s/g, "")}`;
}
