import type { DbOrTx } from "./db";

/**
 * Readable numbers (P-00001, S-00001, F-00001). Each comes from a Postgres
 * sequence through the SQL function `binivol_next_ref`, which is also the
 * column default: concurrent creations never collide.
 */
export const REF_SEQUENCES = {
  person: { prefix: "P-", sequence: "person_ref_seq" },
  trainingRecord: { prefix: "S-", sequence: "training_record_ref_seq" },
  appointment: { prefix: "F-", sequence: "appointment_ref_seq" },
} as const;

export type RefKind = keyof typeof REF_SEQUENCES;

/** Pads to 5 digits and keeps growing past 99999 (same rule as the SQL function). */
export function formatRef(prefix: string, value: number | bigint): string {
  const digits = value.toString();
  return `${prefix}${digits.padStart(Math.max(5, digits.length), "0")}`;
}

/** Splits `P-00042` into its prefix and number, or returns null. */
export function parseRef(ref: string): { prefix: string; value: number } | null {
  const match = /^([A-Z])-(\d{5,})$/.exec(ref.trim().toUpperCase());
  if (!match?.[1] || !match[2]) return null;
  return { prefix: `${match[1]}-`, value: Number(match[2]) };
}

/**
 * Reserves the next readable number of a kind. Use it when the number must be
 * known before the insert (e.g. to show it); otherwise the column default
 * assigns it. A reserved number that ends up unused leaves a gap, never a
 * duplicate.
 */
export async function nextRef(db: DbOrTx, kind: RefKind): Promise<string> {
  const { prefix, sequence } = REF_SEQUENCES[kind];
  const rows = await db.$queryRaw<{ ref: string }[]>`
    SELECT binivol_next_ref(${prefix}::text, ${sequence}::text::regclass) AS ref
  `;
  const ref = rows[0]?.ref;
  if (!ref) throw new Error(`Séquence ${sequence} indisponible.`);
  return ref;
}
