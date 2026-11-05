/**
 * Names of the generated documents and their download header. Pure.
 *
 * `NOM_Prénom_<suffixe>.pdf`: the last name in capitals, the first name with
 * an initial capital on each part, accents kept, spaces turned into `-`,
 * characters forbidden in file names removed.
 */

const FORBIDDEN = /[\\/:*?"<>|\p{Cc}]/gu;

function clean(value: string): string {
  return value
    .normalize("NFC")
    .replace(FORBIDDEN, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/** « jean pierre » → « Jean-Pierre », « o'brien » → « O'Brien ». */
export function capitalizeFirstName(value: string): string {
  return clean(value)
    .toLocaleLowerCase("fr-FR")
    .replace(
      /(^|[-'’])(\p{L})/gu,
      (_m, sep: string, letter: string) => `${sep}${letter.toLocaleUpperCase("fr-FR")}`,
    );
}

export function documentFileName(lastName: string, firstName: string, suffix: string): string {
  const nom = clean(lastName).toLocaleUpperCase("fr-FR") || "NOM";
  const prenom = capitalizeFirstName(firstName) || "Prénom";
  return `${nom}_${prenom}_${clean(suffix)}.pdf`;
}

/**
 * `Content-Disposition` with an ASCII fallback and the exact UTF-8 name in
 * `filename*` (RFC 5987 / RFC 6266).
 */
export function contentDisposition(
  fileName: string,
  type: "attachment" | "inline" = "attachment",
): string {
  const ascii =
    fileName
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_") || "document";
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
