/**
 * Address helpers of the online dossier (client-safe, pure). Suggestions come
 * from `src/server/geo/` (the browser never calls a third party).
 */

/** One suggestion: fills number and street, postal code, city, country. */
export interface AddressSuggestion {
  /** Shown in the list: « 10 Rue de la Paroisse, 78000 Versailles ». */
  label: string;
  /** Number and street (empty for a commune alone). */
  street: string;
  postalCode: string;
  city: string;
  country: "France";
}

export type AddressQueryKind = "address" | "postalCode" | "city";

/** Minimum and maximum length of a query (the server refuses the rest). */
export const ADDRESS_QUERY_MIN = 3;
export const ADDRESS_QUERY_MAX = 120;
/** Waiting time after the last key before asking. */
export const ADDRESS_DEBOUNCE_MS = 250;
export const ADDRESS_MAX_RESULTS = 5;

/**
 * A French postal code: 5 digits, spaces tolerated (« 78 000 »); 4 digits get
 * their leading zero back (« 1000 » → « 01000 », a frequent spreadsheet loss).
 * Anything else: null.
 */
export function normalizePostalCode(raw: string): string | null {
  const digits = raw.replace(/\s+/g, "");
  if (/^\d{5}$/.test(digits)) return digits;
  if (/^\d{4}$/.test(digits)) return `0${digits}`;
  return null;
}

/**
 * The department of a postal code: 2 digits in mainland France; Corsica
 * (20…) is 2A below 20200 and 2B from 20200; overseas (97…, 98…) is 3 digits.
 * The INSEE code, when known, decides (2A004 → 2A).
 */
export function departmentOf(postalCode: string, insee?: string | null): string | null {
  if (insee && /^(2A|2B)/.test(insee)) return insee.slice(0, 2);
  if (!/^\d{5}$/.test(postalCode)) return null;
  if (postalCode.startsWith("20")) return Number(postalCode) < 20200 ? "2A" : "2B";
  if (postalCode.startsWith("97") || postalCode.startsWith("98")) return postalCode.slice(0, 3);
  return postalCode.slice(0, 2);
}

const SMALL_WORDS = new Set([
  "en",
  "de",
  "la",
  "le",
  "les",
  "sur",
  "sous",
  "du",
  "des",
  "aux",
  "et",
  "l",
  "d",
]);

/**
 * La Poste writes communes in capitals without accents (« CLAIREFONTAINE EN
 * YVELINES »): shown as « Clairefontaine en Yvelines ». Accents cannot be
 * restored; the field stays editable.
 */
export function prettyCommune(name: string): string {
  return name
    .toLowerCase()
    .split(" ")
    .map((word, i) =>
      i > 0 && SMALL_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

/** Lower case, no accents, single spaces, hyphens and apostrophes as spaces. */
export function foldPlace(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[-'’]/g, " ")
    .replace(/\bst\b/g, "saint")
    .replace(/\bste\b/g, "sainte")
    .replace(/\s+/g, " ")
    .trim();
}
