import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { derivedKey } from "../secrets";

/**
 * Signature codes (docs/signature.md): 6 digits drawn with `crypto.randomInt`,
 * stored as a salted HMAC only, valid 10 minutes, 5 tries, a new code after
 * 60 s at the earliest and 5 codes per hour per dossier. Compared in
 * constant time.
 */

export const CODE_TTL_MS = 10 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 5;
export const CODE_RESEND_DELAY_MS = 60 * 1000;
export const CODE_MAX_PER_HOUR = 5;

export function newSignatureCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function mac(salt: string, code: string): Buffer {
  return createHmac("sha256", derivedKey("signature-code")).update(`${salt}:${code}`).digest();
}

/** `salt.hmac`: the code itself is never stored. */
export function hashSignatureCode(code: string): string {
  const salt = randomBytes(16).toString("base64url");
  return `${salt}.${mac(salt, code).toString("base64url")}`;
}

export function signatureCodeMatches(code: string, stored: string): boolean {
  const [salt, expected] = stored.split(".");
  if (!salt || !expected || !/^\d{6}$/.test(code)) return false;
  const given = mac(salt, code);
  const wanted = Buffer.from(expected, "base64url");
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

/**
 * Whether a new code may be sent, given the sending times of the previous
 * codes of the dossier (5 per hour) and of this signer (60 s between two).
 * Refused: the delay left, in seconds.
 */
export function canSendCode(
  previous: readonly Date[],
  now: Date,
  sameSigner: readonly Date[] = previous,
): { ok: true } | { ok: false; retryInSeconds: number; reason: "delay" | "hourly" } {
  const t = now.getTime();
  const last = Math.max(0, ...sameSigner.map((d) => d.getTime()));
  if (last > 0 && t - last < CODE_RESEND_DELAY_MS) {
    return {
      ok: false,
      reason: "delay",
      retryInSeconds: Math.ceil((CODE_RESEND_DELAY_MS - (t - last)) / 1000),
    };
  }
  const hour = previous.filter((d) => t - d.getTime() < 3_600_000).map((d) => d.getTime());
  if (hour.length >= CODE_MAX_PER_HOUR) {
    const oldest = Math.min(...hour);
    return {
      ok: false,
      reason: "hourly",
      retryInSeconds: Math.ceil((oldest + 3_600_000 - t) / 1000),
    };
  }
  return { ok: true };
}

export type CodeCheck =
  { ok: true } | { ok: false; reason: "locked" | "expired" | "invalid"; attemptsLeft: number };

/** The verdict on a code typed for a challenge (attempts already made, before this one). */
export function checkSignatureCode(
  challenge: { codeHash: string; expiresAt: Date; attempts: number },
  code: string,
  now: Date,
): CodeCheck {
  if (challenge.attempts >= CODE_MAX_ATTEMPTS)
    return { ok: false, reason: "locked", attemptsLeft: 0 };
  if (challenge.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "expired", attemptsLeft: CODE_MAX_ATTEMPTS - challenge.attempts };
  }
  if (signatureCodeMatches(code.trim(), challenge.codeHash)) return { ok: true };
  const attemptsLeft = CODE_MAX_ATTEMPTS - challenge.attempts - 1;
  return {
    ok: false,
    reason: attemptsLeft <= 0 ? "locked" : "invalid",
    attemptsLeft: Math.max(0, attemptsLeft),
  };
}
