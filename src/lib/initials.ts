/**
 * Builds the initials shown in an `Avatar`.
 *
 * - « Jean-Pierre » + « Durand » → « JD » (first letter of each name)
 * - « Élodie » + « Martin » → « ÉM » (accents kept, upper-cased)
 * - empty or blank values are ignored; returns « ? » when nothing is usable.
 */
export function initials(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string {
  const first = firstLetter(firstName);
  const last = firstLetter(lastName);
  const result = `${first}${last}`;
  return result === "" ? "?" : result;
}

function firstLetter(value: string | null | undefined): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") return "";
  const [letter] = Array.from(trimmed);
  return (letter ?? "").toLocaleUpperCase("fr-FR");
}
