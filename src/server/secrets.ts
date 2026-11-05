import { createHash, hkdfSync } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Keys derived from `AUTH_SECRET` (HKDF-SHA256), one per purpose, so the
 * dossier session cookie and the sealed e-mails never share a key. Without
 * AUTH_SECRET (local development, tests), a fixed development key is used;
 * production always has AUTH_SECRET (checked at start-up).
 */
const DEV_SECRET = "binivol-development-secret-not-for-production";

export type KeyPurpose = "dossier-session" | "sealed-mail" | "signature-code" | "ip-hash";

/**
 * `signature-code` (HMAC of the signature codes) uses `OTP_SECRET` when set,
 * so it can be rotated apart from the sessions; else it derives from AUTH_SECRET.
 */
export function derivedKey(purpose: KeyPurpose): Buffer {
  const env = getEnv();
  const secret =
    (purpose === "signature-code" ? env.OTP_SECRET : undefined) ?? env.AUTH_SECRET ?? DEV_SECRET;
  return Buffer.from(
    hkdfSync("sha256", createHash("sha256").update(secret).digest(), "binivol", purpose, 32),
  );
}
