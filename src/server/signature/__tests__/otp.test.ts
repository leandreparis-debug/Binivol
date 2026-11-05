// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canSendCode,
  challengeState,
  hashIp,
  hashOtpCode,
  newOtpCode,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  verifyOtpCode,
} from "../otp";

const key = Buffer.alloc(32, 7);
const otherKey = Buffer.alloc(32, 8);

describe("signature code", () => {
  it("is six digits, leading zeros kept", () => {
    for (let i = 0; i < 50; i++) expect(newOtpCode()).toMatch(/^\d{6}$/);
  });

  it("stores a salted HMAC, never the code, and checks it", () => {
    const stored = hashOtpCode("012345", key);
    expect(stored).toMatch(/^v1\.[0-9a-f]{32}\.[0-9a-f]{64}$/);
    expect(stored).not.toContain("012345");
    expect(hashOtpCode("012345", key)).not.toBe(stored); // random salt
    expect(verifyOtpCode("012345", stored, key)).toBe(true);
    expect(verifyOtpCode("012346", stored, key)).toBe(false);
    expect(verifyOtpCode("012345", stored, otherKey)).toBe(false);
    expect(verifyOtpCode("12345", stored, key)).toBe(false);
    expect(verifyOtpCode("abcdef", stored, key)).toBe(false);
    expect(verifyOtpCode("012345", "n'importe quoi", key)).toBe(false);
  });

  it("expires after 10 minutes and locks after 5 attempts", () => {
    const now = new Date("2026-11-05T10:00:00Z");
    const fresh = {
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      attempts: 0,
      verifiedAt: null,
    };
    expect(challengeState(fresh, now)).toBe("open");
    expect(challengeState(fresh, new Date(now.getTime() + OTP_TTL_MS))).toBe("expired");
    expect(challengeState({ ...fresh, attempts: OTP_MAX_ATTEMPTS - 1 }, now)).toBe("open");
    expect(challengeState({ ...fresh, attempts: OTP_MAX_ATTEMPTS }, now)).toBe("locked");
    expect(challengeState({ ...fresh, verifiedAt: now }, now)).toBe("verified");
  });
});

describe("sending rhythm", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000);

  it("refuses a new code within 60 seconds, with the remaining delay", () => {
    expect(canSendCode([], [], now)).toEqual({ ok: true });
    const refused = canSendCode([ago(45)], [ago(45)], now);
    expect(refused).toMatchObject({ ok: false, retryInSeconds: 15 });
    expect(!refused.ok && refused.message).toContain("15 secondes");
    expect(canSendCode([ago(60)], [ago(60)], now)).toEqual({ ok: true });
    // Another signer (the legal guardian) right after the volunteer: allowed.
    expect(canSendCode([], [ago(5)], now)).toEqual({ ok: true });
  });

  it("allows 5 codes per hour and per dossier", () => {
    const four = [ago(3000), ago(2000), ago(1000), ago(120)];
    expect(canSendCode(four, four, now)).toEqual({ ok: true });
    const refused = canSendCode([], [ago(3500), ...four], now);
    expect(refused).toMatchObject({ ok: false, retryInSeconds: 100 });
    // Older than an hour: no longer counted.
    expect(canSendCode([], [ago(4000), ...four], now)).toEqual({ ok: true });
  });
});

describe("IP fingerprint", () => {
  it("is an HMAC, never the address", () => {
    const h = hashIp("203.0.113.7", key);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(hashIp(" 203.0.113.7 ", key));
    expect(hashIp("203.0.113.7", otherKey)).not.toBe(h);
    expect(hashIp(null, key)).toBeNull();
  });
});
