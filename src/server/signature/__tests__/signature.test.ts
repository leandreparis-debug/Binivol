// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fakeSignature, makePng } from "@/test/png";
import {
  canSendCode,
  checkSignatureCode,
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  hashSignatureCode,
  newSignatureCode,
  signatureCodeMatches,
} from "../code";
import { checkSignaturePng, checkTypedSignature } from "../png";

const now = new Date("2026-11-05T10:00:00.000Z");

describe("signature code", () => {
  it("has 6 digits, drawn at random", () => {
    const codes = new Set(Array.from({ length: 200 }, () => newSignatureCode()));
    for (const code of codes) expect(code).toMatch(/^\d{6}$/);
    expect(codes.size).toBeGreaterThan(190);
  });

  it("is stored as a salted HMAC, never in clear, and compared exactly", () => {
    const code = "042917";
    const a = hashSignatureCode(code);
    const b = hashSignatureCode(code);
    expect(a).not.toContain(code);
    expect(a).not.toBe(b);
    expect(signatureCodeMatches(code, a)).toBe(true);
    expect(signatureCodeMatches("042918", a)).toBe(false);
    expect(signatureCodeMatches("42917", a)).toBe(false);
    expect(signatureCodeMatches(code, "pas-une-empreinte")).toBe(false);
  });

  it("expires after 10 minutes, and locks after 5 wrong tries", () => {
    const codeHash = hashSignatureCode("123456");
    const fresh = { codeHash, expiresAt: new Date(now.getTime() + CODE_TTL_MS), attempts: 0 };
    expect(checkSignatureCode(fresh, "123456", now)).toEqual({ ok: true });
    expect(checkSignatureCode(fresh, "000000", now)).toEqual({
      ok: false,
      reason: "invalid",
      attemptsLeft: 4,
    });
    expect(checkSignatureCode({ ...fresh, attempts: 4 }, "000000", now)).toMatchObject({
      reason: "locked",
      attemptsLeft: 0,
    });
    expect(
      checkSignatureCode({ ...fresh, attempts: CODE_MAX_ATTEMPTS }, "123456", now),
    ).toMatchObject({ reason: "locked" });
    const later = new Date(now.getTime() + CODE_TTL_MS);
    expect(checkSignatureCode(fresh, "123456", later)).toMatchObject({ reason: "expired" });
  });

  it("waits 60 s between two codes, and allows 5 per hour", () => {
    expect(canSendCode([], now)).toEqual({ ok: true });
    expect(canSendCode([new Date(now.getTime() - 20_000)], now)).toEqual({
      ok: false,
      reason: "delay",
      retryInSeconds: 40,
    });
    const five = [50, 40, 30, 20, 10].map((m) => new Date(now.getTime() - m * 60_000));
    expect(canSendCode(five, now)).toEqual({ ok: false, reason: "hourly", retryInSeconds: 600 });
    expect(canSendCode(five.slice(1), now)).toEqual({ ok: true });
    // The 60 s are per signer: the guardian may get her code right after the minor's.
    const minorJustNow = [new Date(now.getTime() - 5_000)];
    expect(canSendCode(minorJustNow, now, [])).toEqual({ ok: true });
  });
});

describe("drawn and typed signatures", () => {
  it("accepts a real trace", () => {
    expect(checkSignaturePng(fakeSignature()).inked).toBeGreaterThan(150);
  });

  it("refuses an empty trace, a dot, and what is not a PNG", () => {
    expect(() => checkSignaturePng(makePng(300, 100, () => false))).toThrow(/vide/);
    expect(() =>
      checkSignaturePng(makePng(300, 100, (x, y) => x > 100 && x < 110 && y > 40 && y < 50)),
    ).toThrow(/trop courte/);
    expect(() => checkSignaturePng(new Uint8Array([1, 2, 3, 4]))).toThrow(/PNG/);
    expect(() => checkSignaturePng(makePng(2000, 100, () => true))).toThrow(/trop grande/);
  });

  it("a typed signature is the signer's full name, accents and case aside", () => {
    expect(checkTypedSignature("  lucja  nunez-o'brien ", "Łucja Ñúñez-O'Brien")).toBe(
      "lucja nunez-o'brien",
    );
    expect(() => checkTypedSignature("X", "Łucja Ñúñez-O'Brien")).toThrow(/nom complet/);
    expect(() => checkTypedSignature("Jean Exemple", "Łucja Ñúñez-O'Brien")).toThrow(
      /Łucja Ñúñez-O'Brien/,
    );
  });
});
