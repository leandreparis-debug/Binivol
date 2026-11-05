import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Protection of the scheduled task route (step 12, docs/taches.md):
 * `Authorization: Bearer <CRON_SECRET>`, compared in constant time (both
 * sides hashed first, so their lengths never leak). Without a configured
 * secret, everything is refused. The secret is never logged.
 */
export type CronAuth = "ok" | "no-secret" | "denied";

const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();

export function checkCronAuthorization(
  header: string | null,
  secret: string | undefined,
): CronAuth {
  if (!secret) return "no-secret";
  const match = /^Bearer (.+)$/.exec(header ?? "");
  const given = match?.[1] ?? "";
  return timingSafeEqual(digest(given), digest(secret)) && given.length > 0 ? "ok" : "denied";
}
