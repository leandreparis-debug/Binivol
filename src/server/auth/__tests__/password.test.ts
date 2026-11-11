// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  accessLinkUrl,
  hashAccessToken,
  looksLikeAccessToken,
  newAccessToken,
  normalizeUsername,
} from "@/server/auth/credentials";
import {
  hashPassword,
  passwordProblem,
  verifyAgainstDummy,
  verifyPassword,
} from "@/server/auth/password";

describe("hashPassword / verifyPassword (argon2id)", () => {
  it("hashes with argon2id and the OWASP parameters, and verifies", async () => {
    const hash = await hashPassword("une phrase de passe fictive");
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(hash).not.toContain("une phrase");
    expect(await verifyPassword(hash, "une phrase de passe fictive")).toBe(true);
    expect(await verifyPassword(hash, "Une phrase de passe fictive")).toBe(false);
  });

  it("salts every hash and refuses a malformed hash without throwing", async () => {
    expect(await hashPassword("même mot de passe")).not.toBe(
      await hashPassword("même mot de passe"),
    );
    expect(await verifyPassword("pas-un-hash", "x")).toBe(false);
    await expect(verifyAgainstDummy("n'importe quoi")).resolves.toBeUndefined();
  });
});

describe("passwordProblem", () => {
  it.each([
    ["court", null, /au moins 12/],
    ["a".repeat(129), null, /au plus 128/],
    ["            ", null, /espaces/],
    ["camille.d-2026-secret", "camille.d", /identifiant/],
    ["abababababab", null, /trop simple/],
  ])("refuses %j", (password, username, message) => {
    expect(passwordProblem(password, username)).toMatch(message);
  });

  it("accepts a long passphrase, without composition rule", () => {
    expect(passwordProblem("cheval agrafe batterie correcte", "camille.d")).toBeNull();
    expect(passwordProblem("éàü çœ ß 12 ok", null)).toBeNull();
  });
});

describe("identifiers and access links", () => {
  it("normalises identifiers and refuses the others", () => {
    expect(normalizeUsername("  Camille.D ")).toBe("camille.d");
    expect(normalizeUsername("ab")).toBeNull();
    expect(normalizeUsername("camille@exemple.org")).toBeNull();
    expect(normalizeUsername("éloïse")).toBeNull();
    expect(normalizeUsername(".camille")).toBeNull();
  });

  it("creates 32-byte tokens stored as SHA-256 only, in the fragment of the link", () => {
    const { token, tokenHash } = newAccessToken();
    expect(looksLikeAccessToken(token)).toBe(true);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessToken(token)).toBe(tokenHash);
    expect(newAccessToken().token).not.toBe(token);
    expect(accessLinkUrl("https://binivol.exemple.org/", token)).toBe(
      `https://binivol.exemple.org/acces#${token}`,
    );
    expect(looksLikeAccessToken("trop-court")).toBe(false);
  });
});
