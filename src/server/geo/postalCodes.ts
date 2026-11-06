import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ADDRESS_MAX_RESULTS,
  foldPlace,
  normalizePostalCode,
  prettyCommune,
  type AddressSuggestion,
} from "@/lib/geo";

/**
 * Communes and postal codes, from a local file: La Poste's « Base officielle
 * des codes postaux » (Licence Ouverte 2.0, data.gouv.fr), turned into
 * `postal-codes.txt` by `pnpm geo:postal-codes` (ADR-068). No network.
 */

interface Row {
  postalCode: string;
  commune: string;
  insee: string;
  folded: string;
}

let rows: Row[] | null = null;

/** Parses the file once (lines `CP;COMMUNE;INSEE`). Exported for tests. */
export function parsePostalFile(text: string): Row[] {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [postalCode = "", commune = "", insee = ""] = line.split(";");
      return { postalCode, commune, insee, folded: foldPlace(commune) };
    });
}

function all(): Row[] {
  rows ??= parsePostalFile(
    readFileSync(join(process.cwd(), "src", "server", "geo", "postal-codes.txt"), "utf8"),
  );
  return rows;
}

function toSuggestion(row: Row): AddressSuggestion {
  const city = prettyCommune(row.commune);
  return {
    label: `${row.postalCode} ${city}`,
    street: "",
    postalCode: row.postalCode,
    city,
    country: "France",
  };
}

/** A postal code typed alone: its communes (78120 → Rambouillet, Clairefontaine…). */
export function communesOf(raw: string, data: readonly Row[] = all()): AddressSuggestion[] {
  const postalCode = normalizePostalCode(raw);
  if (!postalCode) return [];
  return data
    .filter((r) => r.postalCode === postalCode)
    .slice(0, ADDRESS_MAX_RESULTS * 4)
    .map(toSuggestion);
}

/**
 * A city typed alone: its postal codes. Exact names first, then names that
 * start with the text (accents, hyphens and « St » ignored).
 */
export function postalCodesOf(city: string, data: readonly Row[] = all()): AddressSuggestion[] {
  const key = foldPlace(city);
  if (key.length < 2) return [];
  const exact = data.filter((r) => r.folded === key);
  const prefix = data.filter((r) => r.folded !== key && r.folded.startsWith(key));
  return [...exact, ...prefix].slice(0, ADDRESS_MAX_RESULTS * 2).map(toSuggestion);
}
