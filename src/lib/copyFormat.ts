import { parsePhone } from "./phone";

/**
 * Formats of the « Copier » buttons (dossier review, Gaia sheet; step 16):
 * values pasted elsewhere (Gaia, a spreadsheet, an e-mail). Pure, client-safe.
 * Dates are already `JJ/MM/AAAA` in the views.
 */

/** International « +33 6 12 34 56 78 », or compact « 0612345678 ». Remembered per browser. */
export type PhoneCopyStyle = "international" | "compact";
/** The address as one line, or field by field. Remembered per browser. */
export type AddressCopyStyle = "oneLine" | "fields";

export interface CopyPrefs {
  phone: PhoneCopyStyle;
  address: AddressCopyStyle;
}

export const DEFAULT_COPY_PREFS: CopyPrefs = { phone: "international", address: "fields" };

/** Keys of the browser storage (convenience only: a missing value means the default). */
export const COPY_PREFS_STORAGE_KEY = "binivol.copy.prefs";

/** A phone as typed or shown → the chosen style; anything not French is left as it is. */
export function phoneForCopy(value: string, style: PhoneCopyStyle): string {
  const parsed = parsePhone(value);
  const national = parsed.value && /^0\d{9}$/.test(parsed.value) ? parsed.value : null;
  if (!national) return style === "compact" ? value.replace(/\s+/g, "") : value;
  if (style === "compact") return national;
  return `+33 ${national.slice(1, 2)} ${national.slice(2).replace(/(\d{2})(?=\d)/g, "$1 ")}`;
}

const NAME_KEYS = new Set([
  "lastName",
  "birthName",
  "usageName",
  "emergency.lastName",
  "guardian.lastName",
]);

function isPhoneKey(key: string): boolean {
  return /(^|\.)(phone\d?|proPhone)$/.test(key);
}

/** The text copied for one field: NOM in capitals, phones in the chosen style. */
export function valueForCopy(key: string, value: string, prefs: CopyPrefs): string {
  if (NAME_KEYS.has(key)) return value.toLocaleUpperCase("fr-FR");
  if (isPhoneKey(key)) return phoneForCopy(value, prefs.phone);
  return value;
}

export interface CopyEntry {
  label: string;
  text: string;
}

/** « Champ<TAB>Valeur », one line per field, in the given order. */
export function tabulated(entries: readonly CopyEntry[]): string {
  return entries.map((e) => `${e.label}\t${e.text.replace(/\s*\n\s*/g, " ")}`).join("\n");
}

/** Address keys, in order, for the candidate and for the person to notify. */
const ADDRESS_GROUPS: { prefix: string; label: string; keys: string[] }[] = [
  {
    prefix: "",
    label: "Adresse",
    keys: ["street", "addressComplement", "postalCode", "city", "country"],
  },
  {
    prefix: "emergency.",
    label: "Adresse de la personne à prévenir",
    keys: ["emergency.street", "emergency.postalCode", "emergency.city", "emergency.country"],
  },
];

/** « 10 rue X, Bât. B, 78000 Versailles, France ». */
export function addressOneLine(parts: Record<string, string | undefined>, prefix = ""): string {
  const at = (k: string) => (parts[`${prefix}${k}`] ?? "").trim();
  const town = [at("postalCode"), at("city")].filter(Boolean).join(" ");
  return [at("street"), at("addressComplement"), town, at("country")].filter(Boolean).join(", ");
}

/**
 * The entries « Tout copier » and « Copier la section » write, in the order
 * of the rows. With `address: "oneLine"`, the address fields of a person
 * become one « Adresse » line at the place of the first of them.
 */
export function copyEntries(
  rows: readonly { key: string; label: string; value: string | null }[],
  prefs: CopyPrefs,
): CopyEntry[] {
  const shown = rows.filter((r): r is { key: string; label: string; value: string } => !!r.value);
  if (prefs.address === "fields") {
    return shown.map((r) => ({ label: r.label, text: valueForCopy(r.key, r.value, prefs) }));
  }
  const values = Object.fromEntries(shown.map((r) => [r.key, r.value]));
  const out: CopyEntry[] = [];
  const done = new Set<string>();
  for (const row of shown) {
    const group = ADDRESS_GROUPS.find((g) => g.keys.includes(row.key));
    if (!group) {
      out.push({ label: row.label, text: valueForCopy(row.key, row.value, prefs) });
      continue;
    }
    if (done.has(group.label)) continue;
    done.add(group.label);
    out.push({ label: group.label, text: addressOneLine(values, group.prefix) });
  }
  return out;
}
