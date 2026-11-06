import { getEnv } from "@/lib/env";
import { ADDRESS_MAX_RESULTS, type AddressQueryKind, type AddressSuggestion } from "@/lib/geo";
import { communesOf, postalCodesOf } from "./postalCodes";

/**
 * Address suggestions of the online dossier (step 16, docs/dossier.md).
 *
 * - `ban`: the public Base Adresse Nationale API of the Géoplateforme
 *   (`https://data.geopf.fr/geocodage/search`, no key, ADR-068), called by the
 *   **server only**, with a 2 s timeout; any failure gives no suggestion, so
 *   free typing keeps working;
 * - `none`: never suggests a street (postal codes and communes still come
 *   from the local file);
 * - `fake`: synthetic answers, for tests (no network).
 *
 * The typed text is never logged nor cached.
 */
export interface AddressService {
  driver: "ban" | "none" | "fake";
  suggest(kind: AddressQueryKind, query: string): Promise<AddressSuggestion[]>;
}

export const BAN_SEARCH_URL = "https://data.geopf.fr/geocodage/search";
const TIMEOUT_MS = 2000;

interface BanFeature {
  properties?: {
    label?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    postcode?: string;
    city?: string;
    type?: string;
  };
}

/** Turns the API's GeoJSON into suggestions (exported for tests). */
export function fromBan(body: unknown): AddressSuggestion[] {
  const features = (body as { features?: BanFeature[] } | null)?.features;
  if (!Array.isArray(features)) return [];
  const out: AddressSuggestion[] = [];
  for (const f of features) {
    const p = f.properties;
    if (!p?.postcode || !p.city) continue;
    const street = p.type === "municipality" ? "" : (p.name ?? "");
    out.push({
      label: p.label ?? `${street} ${p.postcode} ${p.city}`.trim(),
      street,
      postalCode: p.postcode,
      city: p.city,
      country: "France",
    });
  }
  return out.slice(0, ADDRESS_MAX_RESULTS);
}

function local(kind: AddressQueryKind, query: string): AddressSuggestion[] | null {
  if (kind === "postalCode") return communesOf(query);
  if (kind === "city") return postalCodesOf(query);
  return null;
}

const banService: AddressService = {
  driver: "ban",
  async suggest(kind, query) {
    const fromFile = local(kind, query);
    if (fromFile) return fromFile;
    try {
      const url = new URL(BAN_SEARCH_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("autocomplete", "1");
      url.searchParams.set("limit", String(ADDRESS_MAX_RESULTS));
      url.searchParams.set("index", "address");
      const response = await fetch(url, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) return [];
      return fromBan(await response.json());
    } catch {
      // Timeout, network, bad answer: no suggestion, never an error for the candidate.
      return [];
    }
  },
};

const noneService: AddressService = {
  driver: "none",
  suggest(kind, query) {
    return Promise.resolve(local(kind, query) ?? []);
  },
};

/** Synthetic streets (« Rue des Essais fictive »), the same answer for the same text. */
const fakeService: AddressService = {
  driver: "fake",
  suggest(kind, query) {
    const fromFile = local(kind, query);
    if (fromFile) return Promise.resolve(fromFile);
    const number = /^\d+/.exec(query.trim())?.[0] ?? "1";
    return Promise.resolve(
      ["Rue des Essais", "Avenue de la Démonstration"].map((name, i) => ({
        label: `${number} ${name} (fictive), 7800${String(i)} Ville fictive`,
        street: `${number} ${name} (fictive)`,
        postalCode: `7800${String(i)}`,
        city: "Ville fictive",
        country: "France" as const,
      })),
    );
  },
};

export function getAddressService(): AddressService {
  switch (getEnv().ADDRESS_PROVIDER) {
    case "none":
      return noneService;
    case "fake":
      return fakeService;
    default:
      return banService;
  }
}
