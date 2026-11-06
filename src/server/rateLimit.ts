import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { getEnv } from "@/lib/env";
import type { DbOrTx } from "./db";
import { DomainError } from "./errors";

/**
 * Rate limiting of the public actions (step 15, docs/audit-securite.md), in
 * the database: portable (Vercel today, a VPS tomorrow), no external
 * service. Fixed window per bucket and client; the client is the first
 * address of `x-forwarded-for` (set by the platform), hashed with the
 * application secret: the table never holds an IP address.
 */

export interface RateRule {
  limit: number;
  windowSeconds: number;
}

export const RATE_RULES = {
  /** Opening a dossier link (token guessing). */
  dossierOpen: { limit: 20, windowSeconds: 15 * 60 },
  /** Sign-in attempts (Google redirect, demo accounts). */
  signIn: { limit: 30, windowSeconds: 15 * 60 },
  /** Saving the dossier, attachments, submission. */
  dossierWrite: { limit: 300, windowSeconds: 15 * 60 },
  /** Address suggestions, per dossier link (step 16). */
  addressSuggest: { limit: 200, windowSeconds: 15 * 60 },
} as const satisfies Record<string, RateRule>;

export type RateBucket = keyof typeof RATE_RULES;

export function rateKey(bucket: string, client: string, pepper: string): string {
  return createHash("sha256").update(`${bucket}\u0000${client}\u0000${pepper}`).digest("hex");
}

/** Counts one hit; returns false when the limit of the window is exceeded. */
export async function hitRateLimit(
  db: DbOrTx,
  key: string,
  rule: RateRule,
  now: Date = new Date(),
): Promise<boolean> {
  const windowStart = new Date(now.getTime() - rule.windowSeconds * 1000);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, ${now}, 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < ${windowStart} THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < ${windowStart} THEN ${now} ELSE rate_limits.window_start END
    RETURNING count`;
  return (rows[0]?.count ?? 1) <= rule.limit;
}

async function clientId(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return h.get("x-real-ip") ?? "unknown";
}

/** Throws a clear French error when the caller exceeds the bucket's limit. */
export async function enforceRateLimit(db: DbOrTx, bucket: RateBucket): Promise<void> {
  const key = rateKey(bucket, await clientId(), getEnv().AUTH_SECRET ?? "");
  if (!(await hitRateLimit(db, key, RATE_RULES[bucket]))) {
    throw new DomainError(
      "RATE_LIMITED",
      "Trop de tentatives en peu de temps. Réessayez dans quelques minutes.",
    );
  }
}
