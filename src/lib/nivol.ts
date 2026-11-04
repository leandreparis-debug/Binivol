/**
 * NIVOL: national volunteer identifier assigned by Gaia (the national tool).
 *
 * Format: 11 digits followed by one upper-case letter (12 characters), e.g.
 * `00012345678A`. This is the shape of every NIVOL in the legacy workbook
 * (46 out of 46, see docs/decisions.md, ADR-009). The database enforces the
 * same rule with the CHECK constraint `persons_nivol_format`.
 */

export const NIVOL_LENGTH = 12;

/** Validated, normalised form: 11 digits + 1 upper-case letter. */
export const NIVOL_PATTERN = /^\d{11}[A-Z]$/;

/** Synthetic example used in docs and placeholders. Not a real NIVOL. */
export const NIVOL_EXAMPLE = "00012345678A";

/**
 * Returns the normalised NIVOL (spaces removed, upper-cased), or `null` when
 * the value is missing or does not match the format.
 */
export function normalizeNivol(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const compact = value.replace(/\s+/g, "").toUpperCase();
  return NIVOL_PATTERN.test(compact) ? compact : null;
}

/**
 * True when the value is a NIVOL once spaces are removed and letters are
 * upper-cased. Does not check that the identifier exists in Gaia.
 */
export function isValidNivolFormat(value: string | null | undefined): boolean {
  return normalizeNivol(value) !== null;
}

/**
 * Returns the NIVOL as it should be displayed (normalised when valid,
 * trimmed otherwise). Rendering in a monospace cell is the component's job.
 * Returns « — » when the value is missing.
 */
export function formatNivol(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return "—";
  return normalizeNivol(trimmed) ?? trimmed;
}
