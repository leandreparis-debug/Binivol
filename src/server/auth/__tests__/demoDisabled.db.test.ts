import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { listDemoAccounts } from "@/server/auth/demo";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();

beforeAll(async () => {
  delete process.env.AUTH_DEMO_LOGIN;
  resetEnvCache();
  await db.user.create({
    data: {
      email: "demo.topaze@binivol.test",
      name: "Alex Démo",
      profiles: { create: [{ profile: "TOPAZE" }] },
    },
  });
});

afterAll(() => {
  resetEnvCache();
});

describe("demo sign-in when AUTH_DEMO_LOGIN is off", () => {
  it("the action answers as if it did not exist and creates no session", async () => {
    // Imported lazily: the module pulls Auth.js, only needed here.
    const { demoSignInAction } = await import("@/app/(auth)/connexion/actions");
    const result = await demoSignInAction({ email: "demo.topaze@binivol.test" });
    expect(result).toEqual({
      ok: false,
      error: "La connexion de démonstration est désactivée.",
      code: "DEMO_LOGIN_DISABLED",
    });
    expect(await db.session.count()).toBe(0);
    expect(await db.auditLog.count({ where: { action: "LOGIN" } })).toBe(0);
  });

  it("the sign-in page lists no demo account", async () => {
    expect(await listDemoAccounts(db)).toEqual([]);
  });
});
