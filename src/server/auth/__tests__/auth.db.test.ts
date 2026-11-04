import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { AccountCreationForbiddenError, createAdapter } from "@/server/auth/adapter";
import { createDemoSession } from "@/server/auth/demo";
import { recordLogin, recordLoginDenied, recordLogout } from "@/server/auth/events";
import { loadActor } from "@/server/auth/loadActor";
import { setActive } from "@/server/services/accounts";
import { getTestDb, resetDatabase } from "@/test/db/testDatabase";

const db = getTestDb();
const adapter = createAdapter(db);
const SYSTEM = { userId: null, label: "Test" };

async function makeUser(
  email: string,
  profiles: ("TOPAZE" | "ACTION" | "DIAMANT")[] = ["ACTION"],
  active = true,
) {
  return db.user.create({
    data: {
      email,
      name: email.split("@")[0] ?? email,
      active,
      profiles: { create: profiles.map((profile) => ({ profile })) },
    },
  });
}

beforeEach(async () => {
  await resetDatabase(db);
});

afterAll(() => {
  delete process.env.AUTH_DEMO_LOGIN;
  resetEnvCache();
});

describe("adapter", () => {
  it("never creates a user", async () => {
    expect(() =>
      adapter.createUser?.({ id: "x", email: "nouveau@croix-rouge.fr", emailVerified: null }),
    ).toThrow(AccountCreationForbiddenError);
    expect(await db.user.count()).toBe(0);
  });

  it("finds a user by e-mail whatever the case", async () => {
    const user = await makeUser("camille.demo@croix-rouge.fr");
    expect((await adapter.getUserByEmail?.("Camille.Demo@Croix-Rouge.FR"))?.id).toBe(user.id);
  });

  it("links a Google account without storing any token", async () => {
    const user = await makeUser("noa@croix-rouge.fr");
    await adapter.linkAccount?.({
      userId: user.id,
      type: "oidc",
      provider: "google",
      providerAccountId: "1234",
      access_token: "secret-access",
      id_token: "secret-id",
      refresh_token: "secret-refresh",
    });
    const accounts = await db.account.findMany();
    expect(accounts).toHaveLength(1);
    expect(JSON.stringify(accounts)).not.toContain("secret");
    expect(
      (await adapter.getUserByAccount?.({ provider: "google", providerAccountId: "1234" }))?.id,
    ).toBe(user.id);
  });

  it("creates, reads, renews and deletes database sessions", async () => {
    const user = await makeUser("sacha@croix-rouge.fr");
    const expires = new Date(Date.now() + 3_600_000);
    await adapter.createSession?.({ sessionToken: "tok", userId: user.id, expires });
    expect((await adapter.getSessionAndUser?.("tok"))?.user.id).toBe(user.id);
    const later = new Date(Date.now() + 7_200_000);
    expect(
      (await adapter.updateSession?.({ sessionToken: "tok", expires: later }))?.expires.getTime(),
    ).toBe(later.getTime());
    // The deleted session is returned: Auth.js hands it to events.signOut (LOGOUT).
    expect((await adapter.deleteSession?.("tok"))?.userId).toBe(user.id);
    expect(await adapter.getSessionAndUser?.("tok")).toBeNull();
    expect(await adapter.deleteSession?.("tok")).toBeNull();
  });

  it("ignores the session of a deactivated or profile-less account", async () => {
    const inactive = await makeUser("inactif@croix-rouge.fr", ["ACTION"], false);
    const bare = await makeUser("sansprofil@croix-rouge.fr", []);
    const expires = new Date(Date.now() + 3_600_000);
    await adapter.createSession?.({ sessionToken: "a", userId: inactive.id, expires });
    await adapter.createSession?.({ sessionToken: "b", userId: bare.id, expires });
    expect(await adapter.getSessionAndUser?.("a")).toBeNull();
    expect(await adapter.getSessionAndUser?.("b")).toBeNull();
  });
});

describe("sign-in journal", () => {
  it("writes LOGIN (and lastLoginAt), LOGIN_DENIED and LOGOUT, never a token", async () => {
    const user = await makeUser("lou@croix-rouge.fr");
    await recordLogin(db, user.id, "google");
    await recordLoginDenied(db, { email: "camille@gmail.com", reason: "domain" });
    await recordLoginDenied(db, { email: "inconnu@croix-rouge.fr", reason: "unknown" });
    await recordLogout(db, user.id);
    const rows = await db.auditLog.findMany({ orderBy: { at: "asc" } });
    expect(rows.map((r) => r.action)).toEqual(["LOGIN", "LOGIN_DENIED", "LOGIN_DENIED", "LOGOUT"]);
    expect(rows[1]?.newValue).toEqual({ email: "camille@gmail.com", reason: "domain" });
    expect(rows[0]).toMatchObject({ actorId: user.id, entity: "User", entityId: user.id });
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: user.id } })).lastLoginAt,
    ).not.toBeNull();
    expect(JSON.stringify(rows)).not.toMatch(/token/i);
  });
});

describe("demo sign-in", () => {
  it("is refused while AUTH_DEMO_LOGIN is off", async () => {
    delete process.env.AUTH_DEMO_LOGIN;
    resetEnvCache();
    await makeUser("demo.action@binivol.test");
    await expect(createDemoSession(db, "demo.action@binivol.test")).rejects.toMatchObject({
      code: "DEMO_LOGIN_DISABLED",
    });
    expect(await db.session.count()).toBe(0);
  });

  it("creates a 12 h database session for a @binivol.test account, and journals it", async () => {
    process.env.AUTH_DEMO_LOGIN = "true";
    resetEnvCache();
    const user = await makeUser("demo.action@binivol.test");
    const now = new Date("2026-11-04T10:00:00Z");
    const session = await createDemoSession(db, "Demo.Action@binivol.test", now);
    expect(session.userId).toBe(user.id);
    expect(session.expires.toISOString()).toBe("2026-11-04T22:00:00.000Z");
    expect(session.sessionToken.length).toBeGreaterThanOrEqual(43);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "LOGIN", entityId: user.id } })).toBe(1);
  });

  it("only accepts @binivol.test addresses and known, active accounts", async () => {
    process.env.AUTH_DEMO_LOGIN = "true";
    resetEnvCache();
    await makeUser("vrai@croix-rouge.fr");
    await expect(createDemoSession(db, "vrai@croix-rouge.fr")).rejects.toMatchObject({
      code: "SIGN_IN_DENIED",
    });
    await expect(createDemoSession(db, "personne@binivol.test")).rejects.toMatchObject({
      code: "SIGN_IN_DENIED",
    });
    await makeUser("off@binivol.test", ["ACTION"], false);
    await expect(createDemoSession(db, "off@binivol.test")).rejects.toMatchObject({
      code: "SIGN_IN_DENIED",
    });
    expect(await db.session.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "LOGIN_DENIED" } })).toBe(3);
  });
});

describe("profiles are re-read on every request", () => {
  it("a removed profile is gone at the next request, a deactivated account has no actor", async () => {
    const user = await makeUser("eden@croix-rouge.fr", ["ACTION", "DIAMANT"]);
    expect([...((await loadActor(db, user.id))?.profiles ?? [])].sort()).toEqual([
      "ACTION",
      "DIAMANT",
    ]);
    await db.userProfile.deleteMany({ where: { userId: user.id, profile: "DIAMANT" } });
    expect([...((await loadActor(db, user.id))?.profiles ?? [])]).toEqual(["ACTION"]);
    await makeUser("topaze@croix-rouge.fr", ["TOPAZE"]);
    await setActive(db, SYSTEM, { userId: user.id, active: false });
    expect(await loadActor(db, user.id)).toBeNull();
  });

  it("deactivation deletes the account's sessions", async () => {
    await makeUser("topaze@croix-rouge.fr", ["TOPAZE"]);
    const user = await makeUser("mae@croix-rouge.fr");
    const expires = new Date(Date.now() + 3_600_000);
    await db.session.createMany({
      data: [
        { sessionToken: "s1", userId: user.id, expires },
        { sessionToken: "s2", userId: user.id, expires },
      ],
    });
    await setActive(db, SYSTEM, { userId: user.id, active: false });
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
});
