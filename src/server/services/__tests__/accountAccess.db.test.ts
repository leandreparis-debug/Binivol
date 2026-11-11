import { beforeEach, describe, expect, it } from "vitest";
import { signInWithPassword } from "@/server/auth/passwordSignIn";
import type { MailMessage, MailService } from "@/server/mail";
import { RATE_RULES } from "@/server/rateLimit";
import {
  completeAccessLink,
  inspectAccessLink,
  inviteAccount,
  issueAccessLink,
} from "@/server/services/accountAccess";
import { createAccount, setActive } from "@/server/services/accounts";
import { getTestDb, resetDatabase } from "@/test/db/testDatabase";

const db = getTestDb();
const cli = { userId: null, label: "CLI" };
const BASE = "https://binivol.exemple.org";
const PASSWORD = "cheval agrafe batterie correcte";
const tokenOf = (url: string) => url.split("#")[1] ?? "";

beforeEach(async () => {
  await resetDatabase(db);
  // A TOPAZE so that the guards never block the tests.
  await createAccount(db, cli, {
    email: "dlus@exemple.org",
    name: "DLUS fictif",
    profiles: ["TOPAZE"],
  });
});

async function invite(username: string | null = null, now?: Date) {
  return inviteAccount(
    db,
    cli,
    { email: "camille@exemple.org", name: "Camille Fictive", profiles: ["ACTION"], username },
    { baseUrl: BASE, mail: null, now },
  );
}

describe("invitation", () => {
  it("creates the account without password and a link stored hashed only", async () => {
    const { account, link } = await invite();
    expect(account).toMatchObject({ username: null, hasPassword: false, active: true });
    expect(link).toMatchObject({ purpose: "INVITE", mailed: false });
    expect(link.url).toMatch(/^https:\/\/binivol\.exemple\.org\/acces#[A-Za-z0-9_-]{43}$/);
    const rows = await db.accountToken.findMany();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(tokenOf(link.url));
    const audit = await db.auditLog.findMany({ where: { entity: "AccountToken" } });
    expect(audit).toHaveLength(1);
    expect(JSON.stringify(audit)).not.toContain(rows[0]?.tokenHash ?? "none");
    // Seven days.
    expect(link.expiresAt.getTime() - (rows[0]?.createdAt.getTime() ?? 0)).toBe(7 * 24 * 3600_000);
  });

  it("e-mails the link only with the smtp driver", async () => {
    const sent: MailMessage[] = [];
    const smtp: MailService = {
      driver: "smtp",
      send: (message) => {
        sent.push(message);
        return Promise.resolve();
      },
    };
    const { link } = await inviteAccount(
      db,
      cli,
      { email: "noa@exemple.org", name: "Noa", profiles: ["LASER"] },
      { baseUrl: BASE, mail: smtp },
    );
    expect(link.mailed).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe("noa@exemple.org");
    expect(sent[0]?.text).toContain(link.url);

    const log: MailService = { driver: "log", send: () => Promise.reject(new Error("never")) };
    const other = await issueAccessLink(
      db,
      cli,
      (await db.user.findUniqueOrThrow({ where: { email: "noa@exemple.org" } })).id,
      {
        baseUrl: BASE,
        mail: log,
      },
    );
    expect(other.mailed).toBe(false);
  });

  it("lets the person choose the identifier and the password, then sign in", async () => {
    const { link } = await invite();
    const token = tokenOf(link.url);
    expect(await inspectAccessLink(db, token)).toMatchObject({
      ok: true,
      purpose: "INVITE",
      name: "Camille Fictive",
      username: null,
    });
    await expect(
      completeAccessLink(db, { token, username: " Camille.F ", password: PASSWORD }),
    ).resolves.toEqual({ username: "camille.f" });

    const user = await db.user.findUniqueOrThrow({ where: { email: "camille@exemple.org" } });
    expect(user.username).toBe("camille.f");
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    const audit = await db.auditLog.findMany({ where: { entityId: user.id } });
    expect(JSON.stringify(audit)).not.toContain(PASSWORD);
    expect(JSON.stringify(audit)).not.toContain(user.passwordHash ?? "none");

    const result = await signInWithPassword(db, { username: "CAMILLE.F", password: PASSWORD });
    expect(result).toMatchObject({ ok: true, userId: user.id });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "LOGIN", entityId: user.id } })).toBe(1);
  });

  it("keeps an identifier fixed by TOPAZE", async () => {
    const { link } = await invite("c.fictive");
    const token = tokenOf(link.url);
    expect(await inspectAccessLink(db, token)).toMatchObject({ username: "c.fictive" });
    await expect(
      completeAccessLink(db, { token, username: "autre.choix", password: PASSWORD }),
    ).resolves.toEqual({ username: "c.fictive" });
  });
});

describe("link validity", () => {
  it("works only once", async () => {
    const { link } = await invite();
    const token = tokenOf(link.url);
    await completeAccessLink(db, { token, username: "camille.f", password: PASSWORD });
    expect(await inspectAccessLink(db, token)).toEqual({ ok: false });
    await expect(
      completeAccessLink(db, { token, username: "camille.g", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_LINK" });
  });

  it("only one of two concurrent uses succeeds", async () => {
    const { link } = await invite();
    const token = tokenOf(link.url);
    const results = await Promise.allSettled([
      completeAccessLink(db, { token, username: "camille.a", password: PASSWORD }),
      completeAccessLink(db, { token, username: "camille.b", password: PASSWORD }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("expires", async () => {
    const issuedAt = new Date(Date.now() - 8 * 24 * 3600_000);
    const { link } = await invite(null, issuedAt);
    const token = tokenOf(link.url);
    expect(await inspectAccessLink(db, token)).toEqual({ ok: false });
    await expect(
      completeAccessLink(db, { token, username: "camille.f", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_LINK" });
    expect(await db.user.count({ where: { username: "camille.f" } })).toBe(0);
  });

  it("is revoked by a newer link, and refused for a deactivated account", async () => {
    const { account, link } = await invite();
    const newer = await issueAccessLink(db, cli, account.id, { baseUrl: BASE, mail: null });
    expect(await inspectAccessLink(db, tokenOf(link.url))).toEqual({ ok: false });
    expect(await inspectAccessLink(db, tokenOf(newer.url))).toMatchObject({ ok: true });
    await setActive(db, cli, { userId: account.id, active: false });
    expect(await inspectAccessLink(db, tokenOf(newer.url))).toEqual({ ok: false });
    await expect(
      issueAccessLink(db, cli, account.id, { baseUrl: BASE, mail: null }),
    ).rejects.toMatchObject({ code: "ACCOUNT_INACTIVE" });
  });

  it("is not consumed by a weak password or a taken identifier", async () => {
    await createAccount(db, cli, {
      email: "pris@exemple.org",
      name: "",
      profiles: ["LASER"],
      username: "deja.pris",
    });
    const { link } = await invite();
    const token = tokenOf(link.url);
    await expect(
      completeAccessLink(db, { token, username: "camille.f", password: "court" }),
    ).rejects.toMatchObject({ code: "WEAK_PASSWORD" });
    await expect(
      completeAccessLink(db, { token, username: "deja.pris", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
    await expect(
      completeAccessLink(db, { token, username: "pas valide", password: PASSWORD }),
    ).rejects.toMatchObject({ code: "INVALID_USERNAME" });
    expect(await inspectAccessLink(db, token)).toMatchObject({ ok: true });
  });

  it("refuses a malformed or unknown token", async () => {
    expect(await inspectAccessLink(db, "")).toEqual({ ok: false });
    expect(await inspectAccessLink(db, "x".repeat(43))).toEqual({ ok: false });
  });
});

describe("password sign-in", () => {
  async function activated() {
    const { account, link } = await invite("camille.f");
    await completeAccessLink(db, { token: tokenOf(link.url), password: PASSWORD });
    return account;
  }

  it("refuses a wrong password and an unknown identifier the same way, journaled", async () => {
    const account = await activated();
    expect(
      await signInWithPassword(db, { username: "camille.f", password: "mauvais mot de passe" }),
    ).toEqual({
      ok: false,
      reason: "bad_credentials",
    });
    expect(await signInWithPassword(db, { username: "inconnu", password: PASSWORD })).toEqual({
      ok: false,
      reason: "bad_credentials",
    });
    const denied = await db.auditLog.findMany({
      where: { action: "LOGIN_DENIED" },
      orderBy: { at: "asc" },
    });
    expect(denied.map((d) => d.newValue)).toEqual([
      { username: "camille.f", reason: "bad_credentials" },
      { username: "inconnu", reason: "bad_credentials" },
    ]);
    expect(JSON.stringify(denied)).not.toContain("mauvais");
    expect(await db.session.count({ where: { userId: account.id } })).toBe(0);
  });

  it("refuses an account invited but without password yet", async () => {
    await invite("camille.f");
    expect(await signInWithPassword(db, { username: "camille.f", password: PASSWORD })).toEqual({
      ok: false,
      reason: "bad_credentials",
    });
  });

  it("locks the identifier after repeated failures, even with the right password", async () => {
    await activated();
    for (let i = 0; i < RATE_RULES.signInFailure.limit; i += 1) {
      await signInWithPassword(db, { username: "camille.f", password: `faux ${String(i)}` });
    }
    expect(await signInWithPassword(db, { username: "camille.f", password: PASSWORD })).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    // After the window, the right password works again.
    const later = new Date(Date.now() + (RATE_RULES.signInFailure.windowSeconds + 1) * 1000);
    expect(
      await signInWithPassword(db, { username: "camille.f", password: PASSWORD }, later),
    ).toMatchObject({ ok: true });
  });

  it("refuses a deactivated account once the password is right", async () => {
    const account = await activated();
    await setActive(db, cli, { userId: account.id, active: false });
    expect(await signInWithPassword(db, { username: "camille.f", password: PASSWORD })).toEqual({
      ok: false,
      reason: "inactive",
    });
  });

  it("a new-password link replaces the password and closes the sessions", async () => {
    const account = await activated();
    await signInWithPassword(db, { username: "camille.f", password: PASSWORD });
    expect(await db.session.count({ where: { userId: account.id } })).toBe(1);

    const reset = await issueAccessLink(db, cli, account.id, { baseUrl: BASE, mail: null });
    expect(reset.purpose).toBe("RESET");
    // The old password keeps working until the link is used.
    expect(
      await signInWithPassword(db, { username: "camille.f", password: PASSWORD }),
    ).toMatchObject({ ok: true });
    await completeAccessLink(db, {
      token: tokenOf(reset.url),
      password: "nouvelle phrase de passe fictive",
    });
    expect(await db.session.count({ where: { userId: account.id } })).toBe(0);
    expect(
      await signInWithPassword(db, { username: "camille.f", password: PASSWORD }),
    ).toMatchObject({
      ok: false,
      reason: "bad_credentials",
    });
    expect(
      await signInWithPassword(db, {
        username: "camille.f",
        password: "nouvelle phrase de passe fictive",
      }),
    ).toMatchObject({ ok: true });
  });
});
