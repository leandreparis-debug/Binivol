import { z } from "zod";
import { ADDRESS_QUERY_MAX, ADDRESS_QUERY_MIN, type AddressSuggestion } from "@/lib/geo";
import { getEnv } from "@/lib/env";
import type { DbOrTx } from "../db";
import { hitRateLimit, RATE_RULES, rateKey } from "../rateLimit";
import { getAddressService } from "./address";

/** A suggestion request: what is typed, in which field. */
export const addressQuerySchema = z.object({
  kind: z.enum(["address", "postalCode", "city"]),
  q: z.string().trim().min(ADDRESS_QUERY_MIN).max(ADDRESS_QUERY_MAX),
});

export type AddressQuery = z.infer<typeof addressQuerySchema>;

/**
 * Suggestions for one dossier (its link id keys the rate limit): no more than
 * `addressSuggest` per 15 minutes, then none (free typing goes on). The text
 * is never logged nor stored; only the hashed (bucket, link) counter is.
 */
export async function suggestForDossier(
  db: DbOrTx,
  dossierKey: string,
  query: AddressQuery,
): Promise<AddressSuggestion[]> {
  const key = rateKey("addressSuggest", dossierKey, getEnv().AUTH_SECRET ?? "");
  if (!(await hitRateLimit(db, key, RATE_RULES.addressSuggest))) return [];
  return getAddressService().suggest(query.kind, query.q);
}
