// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  evaluateSignIn,
  handleSignIn,
  isEmailInDomain,
  signInErrorMessage,
  type KnownUser,
} from "@/server/auth/signIn";

const DOMAIN = "croix-rouge.fr";
const active: KnownUser = { id: "u1", active: true, profileCount: 1 };

describe("evaluateSignIn", () => {
  it("accepts a verified address of the domain with an active account and a profile", () => {
    expect(
      evaluateSignIn({ email: "camille.demo@croix-rouge.fr", emailVerified: true }, active, DOMAIN),
    ).toEqual({
      ok: true,
      email: "camille.demo@croix-rouge.fr",
      userId: "u1",
    });
  });

  it("compares addresses in lower case", () => {
    const decision = evaluateSignIn(
      { email: "  Camille.Demo@Croix-Rouge.FR ", emailVerified: true },
      active,
      DOMAIN,
    );
    expect(decision).toMatchObject({ ok: true, email: "camille.demo@croix-rouge.fr" });
  });

  it.each([
    [
      "an unverified address",
      { email: "camille@croix-rouge.fr", emailVerified: false },
      active,
      "domain",
    ],
    ["a gmail address", { email: "camille@gmail.com", emailVerified: true }, active, "domain"],
    [
      "a look-alike domain",
      { email: "camille@fake-croix-rouge.fr", emailVerified: true },
      active,
      "domain",
    ],
    [
      "a sub-domain trick",
      { email: "camille@croix-rouge.fr.evil.com", emailVerified: true },
      active,
      "domain",
    ],
    ["no address", { email: null, emailVerified: true }, active, "domain"],
    [
      "an unknown account",
      { email: "inconnu@croix-rouge.fr", emailVerified: true },
      null,
      "unknown",
    ],
    [
      "a deactivated account",
      { email: "x@croix-rouge.fr", emailVerified: true },
      { ...active, active: false },
      "inactive",
    ],
    [
      "an account without profile",
      { email: "x@croix-rouge.fr", emailVerified: true },
      { ...active, profileCount: 0 },
      "no_profile",
    ],
  ] as const)("refuses %s", (_label, identity, user, reason) => {
    expect(evaluateSignIn(identity, user, DOMAIN)).toMatchObject({ ok: false, reason });
  });

  it("checks the domain exactly", () => {
    expect(isEmailInDomain("a@croix-rouge.fr", DOMAIN)).toBe(true);
    expect(isEmailInDomain("a@b@croix-rouge.fr", DOMAIN)).toBe(false);
    expect(isEmailInDomain("a@xcroix-rouge.fr", DOMAIN)).toBe(false);
  });
});

describe("handleSignIn (signIn callback)", () => {
  it("journals the refusal and redirects with the reason, without looking up foreign addresses", async () => {
    const deps = { findUser: vi.fn(), recordDenied: vi.fn().mockResolvedValue(undefined) };
    const result = await handleSignIn(
      { email: "camille@gmail.com", emailVerified: true },
      DOMAIN,
      deps,
    );
    expect(result).toBe("/connexion?error=domain");
    expect(deps.findUser).not.toHaveBeenCalled();
    expect(deps.recordDenied).toHaveBeenCalledWith({
      ok: false,
      email: "camille@gmail.com",
      reason: "domain",
    });
  });

  it.each([
    [null, "unknown"],
    [{ id: "u2", active: false, profileCount: 2 }, "inactive"],
    [{ id: "u3", active: true, profileCount: 0 }, "no_profile"],
  ] as const)("refuses the account %j with %s", async (user, reason) => {
    const deps = {
      findUser: vi.fn().mockResolvedValue(user),
      recordDenied: vi.fn().mockResolvedValue(undefined),
    };
    await expect(
      handleSignIn({ email: "X@croix-rouge.fr", emailVerified: true }, DOMAIN, deps),
    ).resolves.toBe(`/connexion?error=${reason}`);
    expect(deps.findUser).toHaveBeenCalledWith("x@croix-rouge.fr");
    expect(deps.recordDenied).toHaveBeenCalledWith(expect.objectContaining({ reason }));
  });

  it("returns true and journals nothing on success", async () => {
    const deps = { findUser: vi.fn().mockResolvedValue(active), recordDenied: vi.fn() };
    await expect(
      handleSignIn({ email: "a@croix-rouge.fr", emailVerified: true }, DOMAIN, deps),
    ).resolves.toBe(true);
    expect(deps.recordDenied).not.toHaveBeenCalled();
  });
});

describe("signInErrorMessage", () => {
  it("gives the French message of each reason", () => {
    expect(signInErrorMessage("domain")).toBe("Utilisez votre adresse @croix-rouge.fr.");
    expect(signInErrorMessage("unknown")).toBe(
      "Ce compte n'a pas encore accès à Binivol. Demandez-le au DLUS.",
    );
    expect(signInErrorMessage("inactive")).toBe("Ce compte est désactivé. Contactez le DLUS.");
    expect(signInErrorMessage("no_profile")).toBe("Ce compte est désactivé. Contactez le DLUS.");
    expect(signInErrorMessage("OAuthAccountNotLinked")).toMatch(/La connexion a échoué/);
    expect(signInErrorMessage(undefined)).toBeNull();
  });
});
