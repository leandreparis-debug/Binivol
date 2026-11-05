/**
 * File names of the official documents (step 8): `NOM_Prénom_<Document>.pdf`.
 * The NOM is upper case, the first name has an initial capital, accents are
 * kept, spaces become `-`, forbidden characters are removed. Pure.
 */

export type OfficialDocument = "DOSSIER" | "CHARTE" | "APTITUDE" | "PROOF";

const SUFFIX: Record<OfficialDocument, string> = {
  DOSSIER: "Dossier-Bénévole",
  CHARTE: "Charte-du-Bénévolat",
  APTITUDE: "Attestation-d_Aptitude",
  PROOF: "Preuve-de-signature",
};

/** Characters refused by common file systems, control characters, and `_` (the separator). */
const FORBIDDEN = /[\\/:*?"<>|_\u0000-\u001f\u007f]/g;

function clean(value: string): string {
  return value
    .normalize("NFC")
    .replace(FORBIDDEN, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
}

/** « jean-éric » → « Jean-Éric », « o'brien » → « O'Brien ». */
function capitalise(value: string): string {
  return value
    .toLocaleLowerCase("fr-FR")
    .replace(
      /(^|[-'’\s])(\p{L})/gu,
      (_m, sep: string, letter: string) => sep + letter.toLocaleUpperCase("fr-FR"),
    );
}

export function officialFileName(
  lastName: string,
  firstName: string,
  document: OfficialDocument,
): string {
  const last = clean(lastName).toLocaleUpperCase("fr-FR") || "NOM";
  const first = capitalise(clean(firstName)) || "Prénom";
  return `${last}_${first}_${SUFFIX[document]}.pdf`;
}

/**
 * `Content-Disposition` of a download: an ASCII fallback `filename` and the
 * exact UTF-8 name in `filename*` (RFC 5987, RFC 6266).
 */
export function contentDisposition(
  fileName: string,
  type: "attachment" | "inline" = "attachment",
): string {
  const ascii = fileName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
