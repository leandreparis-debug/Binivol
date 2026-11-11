import { execFileSync } from "node:child_process";
import { beforeEach, describe, expect, it } from "vitest";
import {
  createAccount,
  grantAccount,
  listAccounts,
  revokeAccount,
  setActive,
  setProfiles,
} from "@/server/services/accounts";
import { getTestDb, resetDatabase, resolveTestDatabaseUrl } from "@/test/db/testDatabase";

const db = getTestDb();
const cli = { userId: null, label: "CLI" };

beforeEach(async () => {
  await resetDatabase(db);
});

async function topaze(email = "dlus@croix-rouge.fr") {
  return createAccount(db, cli, { email, name: "DLUS fictif", profiles: ["TOPAZE"] });
}

describe("createAccount", () => {
  it("accepts any domain (ADR-070) and an identifier fixed in lower case", async () => {
    const account = await createAccount(db, cli, {
      email: "camille@exemple.org",
      name: "Camille",
      profiles: ["ACTION"],
      username: " Camille.D ",
    });
    expect(account).toMatchObject({ username: "camille.d", hasPassword: false });
    await expect(
      createAccount(db, cli, {
        email: "autre@exemple.org",
        name: "",
        profiles: ["ACTION"],
        username: "camille.d",
      }),
    ).rejects.toMatchObject({ code: "USERNAME_TAKEN" });
  });

  it("creates an account in lower case, with its profiles and an audit entry", async () => {
    const account = await createAccount(db, cli, {
      email: " Camille.Demo@Croix-Rouge.fr ",
      name: "Camille",
      profiles: ["DIAMANT", "FORMAT"],
    });
    expect(account).toMatchObject({
      email: "camille.demo@croix-rouge.fr",
      active: true,
      profiles: ["FORMAT", "DIAMANT"],
    });
    const entry = await db.auditLog.findFirstOrThrow({ where: { entityId: account.id } });
    expect(entry).toMatchObject({ action: "CREATE", entity: "User", actorLabel: "CLI" });
  });

  it.each([
    ["a malformed address", "camille@", ["ACTION"], "INVALID_EMAIL"],
    ["a malformed identifier", "camille@exemple.org", ["ACTION"], "INVALID_USERNAME"],
    ["no profile", "camille@croix-rouge.fr", [], "NO_PROFILE"],
  ] as const)("refuses %s", async (_label, email, profiles, code) => {
    await expect(
      createAccount(db, cli, {
        email,
        name: "",
        profiles: [...profiles],
        username: code === "INVALID_USERNAME" ? "É!" : null,
      }),
    ).rejects.toMatchObject({ code });
  });

  it("refuses a duplicate address", async () => {
    await topaze();
    await expect(topaze("DLUS@croix-rouge.fr")).rejects.toMatchObject({ code: "EMAIL_TAKEN" });
  });
});

describe("TOPAZE guards", () => {
  it("refuses to deactivate or demote the last active TOPAZE", async () => {
    const only = await topaze();
    await expect(setActive(db, cli, { userId: only.id, active: false })).rejects.toMatchObject({
      code: "LAST_TOPAZE",
      message: "Impossible : c'est le dernier compte TOPAZE actif.",
    });
    await expect(
      setProfiles(db, cli, { userId: only.id, profiles: ["ACTION"] }),
    ).rejects.toMatchObject({ code: "LAST_TOPAZE" });
    expect((await listAccounts(db))[0]).toMatchObject({ active: true, profiles: ["TOPAZE"] });
  });

  it("allows it once another TOPAZE is active", async () => {
    const first = await topaze();
    await topaze("adjoint@croix-rouge.fr");
    await expect(
      setProfiles(db, cli, { userId: first.id, profiles: ["ACTION"] }),
    ).resolves.toMatchObject({ profiles: ["ACTION"] });
  });

  it("counts only active TOPAZE accounts", async () => {
    const first = await topaze();
    const second = await topaze("adjoint@croix-rouge.fr");
    await setActive(db, cli, { userId: second.id, active: false });
    await expect(setActive(db, cli, { userId: first.id, active: false })).rejects.toMatchObject({
      code: "LAST_TOPAZE",
    });
  });

  it("refuses to remove one's own TOPAZE or to deactivate oneself", async () => {
    const me = await topaze();
    await topaze("adjoint@croix-rouge.fr");
    const self = { userId: me.id, label: "DLUS fictif" };
    await expect(
      setProfiles(db, self, { userId: me.id, profiles: ["ACTION"] }),
    ).rejects.toMatchObject({
      code: "SELF_TOPAZE_REMOVAL",
    });
    await expect(setActive(db, self, { userId: me.id, active: false })).rejects.toMatchObject({
      code: "SELF_DEACTIVATION",
    });
  });

  it("does not let two concurrent changes remove the last two TOPAZE", async () => {
    const a = await topaze("a@croix-rouge.fr");
    const b = await topaze("b@croix-rouge.fr");
    const results = await Promise.allSettled([
      setActive(db, cli, { userId: a.id, active: false }),
      setActive(db, cli, { userId: b.id, active: false }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.user.count({ where: { active: true, profiles: { some: { profile: "TOPAZE" } } } }),
    ).toBe(1);
  });
});

describe("audit of changes", () => {
  it("records profiles and activity before and after", async () => {
    await topaze();
    const account = await createAccount(db, cli, {
      email: "noa@croix-rouge.fr",
      name: "Noa",
      profiles: ["ACTION"],
    });
    await setProfiles(db, cli, { userId: account.id, profiles: ["ACTION", "LASER"] });
    await setActive(db, cli, { userId: account.id, active: false });
    const updates = await db.auditLog.findMany({
      where: { entityId: account.id, action: "UPDATE" },
      orderBy: { at: "asc" },
    });
    expect(updates.map((u) => [u.field, u.oldValue, u.newValue])).toEqual([
      ["profiles", ["ACTION"], ["ACTION", "LASER"]],
      ["active", true, false],
    ]);
  });
});

describe("grantAccount and revokeAccount (pnpm admin:*)", () => {
  it("creates, then updates and reactivates, then deactivates", async () => {
    await topaze();
    const first = await grantAccount(db, cli, {
      email: "sacha@croix-rouge.fr",
      profiles: ["LASER"],
    });
    expect(first).toMatchObject({ created: true, account: { profiles: ["LASER"], active: true } });
    await revokeAccount(db, cli, "SACHA@croix-rouge.fr");
    const again = await grantAccount(db, cli, {
      email: "sacha@croix-rouge.fr",
      profiles: ["ACTION", "LASER"],
    });
    expect(again).toMatchObject({
      created: false,
      account: { profiles: ["ACTION", "LASER"], active: true },
    });
  });

  it("refuses to revoke the last TOPAZE and an unknown address", async () => {
    await topaze();
    await expect(revokeAccount(db, cli, "dlus@croix-rouge.fr")).rejects.toMatchObject({
      code: "LAST_TOPAZE",
    });
    await expect(revokeAccount(db, cli, "absent@croix-rouge.fr")).rejects.toMatchObject({
      code: "ACCOUNT_NOT_FOUND",
    });
  });

  it("the CLI creates the first TOPAZE with an audit entry labelled CLI", async () => {
    const url = resolveTestDatabaseUrl();
    const env = {
      ...process.env,
      DATABASE_URL: url,
      DIRECT_URL: url,
      APP_URL: "https://binivol.exemple.org",
    };
    const out = execFileSync(
      "pnpm",
      [
        "--silent",
        "admin:grant",
        "premier.dlus@croix-rouge.fr",
        "TOPAZE",
        "--name",
        "Premier DLUS",
      ],
      {
        env,
        encoding: "utf8",
      },
    );
    expect(out).toMatch(/Compte créé : premier\.dlus@croix-rouge\.fr \(TOPAZE\)/);
    // The CLI prints an invitation link (token in the fragment), stored hashed only.
    const token = /https:\/\/binivol\.exemple\.org\/acces#([A-Za-z0-9_-]{43})/.exec(out)?.[1];
    expect(token).toBeDefined();
    const links = await db.accountToken.findMany();
    expect(links).toHaveLength(1);
    expect(links[0]?.purpose).toBe("INVITE");
    expect(JSON.stringify(links)).not.toContain(token ?? "none");
    const created = await db.user.findUniqueOrThrow({
      where: { email: "premier.dlus@croix-rouge.fr" },
    });
    expect(created.name).toBe("Premier DLUS");
    expect(
      await db.auditLog.count({
        where: { entityId: created.id, actorLabel: "CLI", action: "CREATE" },
      }),
    ).toBe(1);
    expect(() =>
      execFileSync("pnpm", ["--silent", "admin:grant", "x@exemple.org", "INCONNU"], {
        env,
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow(/Profil inconnu/);
    expect(() =>
      execFileSync("pnpm", ["--silent", "admin:revoke", "premier.dlus@croix-rouge.fr"], {
        env,
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow(/dernier compte TOPAZE/);
  });
});
