// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DOSSIER_COOKIE_PATH,
  DOSSIER_SESSION_SECONDS,
  dossierCookieOptions,
  openDossierSession,
  sealDossierSession,
} from "../session";
import { hashDossierToken, looksLikeDossierToken, newDossierToken } from "../token";

describe("dossier token", () => {
  it("is 32 random bytes in base64url, stored as its SHA-256 only", () => {
    const a = newDossierToken();
    const b = newDossierToken();
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.tokenHash).toBe(hashDossierToken(a.token));
    expect(a.tokenHash).not.toContain(a.token);
  });

  it("recognises the shape of a token before any lookup", () => {
    expect(looksLikeDossierToken(newDossierToken().token)).toBe(true);
    expect(looksLikeDossierToken("abc")).toBe(false);
    expect(looksLikeDossierToken(`${"a".repeat(42)}=`)).toBe(false);
  });
});

describe("dossier session cookie", () => {
  it("holds the link id, signed, for 2 hours", () => {
    const now = Date.UTC(2026, 10, 5, 10);
    const value = sealDossierSession("link_1", now);
    expect(openDossierSession(value, now + 1000)).toEqual({
      linkId: "link_1",
      exp: now + DOSSIER_SESSION_SECONDS * 1000,
    });
    expect(openDossierSession(value, now + DOSSIER_SESSION_SECONDS * 1000 + 1)).toBeNull();
  });

  it("refuses a tampered or malformed cookie", () => {
    // Fixed instant: the signature (hence its first character) no longer depends on the clock.
    const at = Date.UTC(2026, 10, 5, 10);
    const value = sealDossierSession("link_1", at);
    const [body = "", sig = ""] = value.split(".");
    const forged = Buffer.from(
      JSON.stringify({ linkId: "link_2", exp: Date.now() + 1e6 }),
    ).toString("base64url");
    expect(openDossierSession(`${forged}.${sig}`)).toBeNull();
    // A different first character: « x » was the original one once in 64 runs (flaky).
    const tampered = `${sig.startsWith("x") ? "y" : "x"}${sig.slice(1)}`;
    expect(tampered).not.toBe(sig);
    expect(openDossierSession(`${body}.${tampered}`, at + 1000)).toBeNull();
    expect(openDossierSession("n'importe quoi")).toBeNull();
    expect(openDossierSession(undefined)).toBeNull();
  });

  it("is HttpOnly, SameSite=Lax, limited to /dossier, Secure over HTTPS", () => {
    expect(dossierCookieOptions(true)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      path: DOSSIER_COOKIE_PATH,
      secure: true,
      maxAge: DOSSIER_SESSION_SECONDS,
    });
    expect(DOSSIER_COOKIE_PATH).toBe("/dossier");
  });
});
