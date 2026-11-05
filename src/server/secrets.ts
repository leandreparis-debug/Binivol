import { createHash, hkdfSync } from "node:crypto";
import { getEnv } from "@/lib/env";

/**
 * Keys derived from `AUTH_SECRET` (HKDF-SHA256), one per purpose, so the
 * dossier session cookie and the sealed e-mails never share a key. Without
 * AUTH_SECRET (local development, tests), a fixed development key is used;
 * production always has AUTH_SECRET (checked at start-up).
 */
const DEV_SECRET = "binivol-development-secret-not-for-production";

export type KeyPurpose = "dossier-session" | "sealed-mail" | "otp-code" | "ip-hash";

/**
 * The signature's HMAC keys (`otp-code`, `ip-hash`) come from
 * SIGNATURE_HMAC_SECRET when it is set, from AUTH_SECRET otherwise.
 */
export function derivedKey(purpose: KeyPurpose): Buffer {
  const env = getEnv();
  const signature = purpose === "otp-code" || purpose === "ip-hash";
  const secret =
    (signature ? env.SIGNATURE_HMAC_SECRET : undefined) ?? env.AUTH_SECRET ?? DEV_SECRET;
  return Buffer.from(
    hkdfSync("sha256", createHash("sha256").update(secret).digest(), "binivol", purpose, 32),
  );
}
