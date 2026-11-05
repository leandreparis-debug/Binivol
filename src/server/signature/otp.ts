import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { derivedKey } from "../secrets";

/**
 * The six-digit signature code (step 8). Pure rules, no database:
 * - drawn with `crypto.randomInt`;
 * - only an HMAC-SHA256 (server key, random salt) is stored, never the code;
 * - valid 10 minutes, 5 attempts at most;
 * - a new code 60 seconds after the same signer's previous one at the
 *   earliest, 5 per hour and per dossier at most;
 * - compared in constant time.
 */

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_DELAY_MS = 60 * 1000;
export const OTP_MAX_PER_HOUR = 5;

const HOUR_MS = 60 * 60 * 1000;

/** Six digits, leading zeros kept. */
export function newOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function hmac(salt: string, code: string, key: Buffer): string {
  return createHmac("sha256", key).update(`${salt}:${code}`).digest("hex");
}

/** `v1.<salt>.<hmac>`: what `OtpChallenge.codeHash` holds. */
export function hashOtpCode(code: string, key: Buffer = derivedKey("otp-code")): string {
  const salt = randomBytes(16).toString("hex");
  return ["v1", salt, hmac(salt, code, key)].join(".");
}

/** Constant-time check of a typed code against the stored HMAC. */
export function verifyOtpCode(
  code: string,
  stored: string,
  key: Buffer = derivedKey("otp-code"),
): boolean {
  const [version, salt, expected] = stored.split(".");
  if (version !== "v1" || !salt || !expected || !/^\d{6}$/.test(code)) return false;
  const given = Buffer.from(hmac(salt, code, key), "hex");
  const wanted = Buffer.from(expected, "hex");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

export type SendDecision = { ok: true } | { ok: false; retryInSeconds: number; message: string };

/**
 * May a new code be sent now? `sameSigner` lists the creation times of the
 * previous codes of this signer (the 60-second delay), `dossier` those of
 * every signer of the dossier (5 per hour). Any order.
 */
export function canSendCode(
  sameSigner: Date[],
  dossier: Date[] = sameSigner,
  now: Date = new Date(),
): SendDecision {
  const t = now.getTime();
  const last = Math.max(...sameSigner.map((d) => d.getTime()), Number.NEGATIVE_INFINITY);
  if (t - last < OTP_RESEND_DELAY_MS) {
    const wait = Math.ceil((OTP_RESEND_DELAY_MS - (t - last)) / 1000);
    return {
      ok: false,
      retryInSeconds: wait,
      message: `Un code vient d'être envoyé. Tu pourras en demander un nouveau dans ${String(wait)} secondes.`,
    };
  }
  const recent = dossier.map((d) => d.getTime()).filter((s) => s > t - HOUR_MS);
  if (recent.length >= OTP_MAX_PER_HOUR) {
    const oldest = Math.min(...recent);
    const wait = Math.ceil((oldest + HOUR_MS - t) / 1000);
    return {
      ok: false,
      retryInSeconds: wait,
      message: `Trop de codes demandés. Tu pourras en demander un nouveau dans ${String(Math.ceil(wait / 60))} minutes.`,
    };
  }
  return { ok: true };
}

export type ChallengeState = "open" | "expired" | "locked" | "verified";

export function challengeState(
  challenge: { expiresAt: Date; attempts: number; verifiedAt: Date | null },
  now: Date = new Date(),
): ChallengeState {
  if (challenge.verifiedAt) return "verified";
  if (challenge.attempts >= OTP_MAX_ATTEMPTS) return "locked";
  if (challenge.expiresAt.getTime() <= now.getTime()) return "expired";
  return "open";
}

/** HMAC-SHA256 of an IP address (never the address itself). */
export function hashIp(ip: string | null, key: Buffer = derivedKey("ip-hash")): string | null {
  if (!ip) return null;
  return createHmac("sha256", key).update(ip.trim()).digest("hex");
}
