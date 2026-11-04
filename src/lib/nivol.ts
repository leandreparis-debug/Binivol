/**
 * NIVOL: national volunteer identifier assigned by Gaia (the national tool).
 *
 * Working assumption (to be confirmed with the UL): the NIVOL is an
 * alphanumeric string of 6 to 20 characters. The exact format will be locked
 * at step 2 (data model); until then only this loose check is applied.
 */

export const NIVOL_MIN_LENGTH = 6;
export const NIVOL_MAX_LENGTH = 20;

const NIVOL_PATTERN = /^[A-Za-z0-9]+$/;

/**
 * Returns the NIVOL as it should be displayed: unchanged, trimmed.
 * Rendering in a monospace cell is the component's job (see `DataTable`).
 * Returns « — » when the value is missing.
 */
export function formatNivol(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? "—" : trimmed;
}

/**
 * Loose format check: alphanumeric, 6 to 20 characters once spaces are removed.
 * Does not verify the identifier exists in Gaia.
 */
export function isValidNivolFormat(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const compact = value.replace(/\s+/g, "");
  return (
    compact.length >= NIVOL_MIN_LENGTH &&
    compact.length <= NIVOL_MAX_LENGTH &&
    NIVOL_PATTERN.test(compact)
  );
}
