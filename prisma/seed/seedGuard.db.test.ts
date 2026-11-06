import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb, resetDatabase } from "@/test/db/testDatabase";
import { countRows, RealDataPresentError, SEED_VOLUMES, seedBase, seedDemo } from "./index";

const db = getTestDb();
const today = new Date("2026-11-04T00:00:00.000Z");

beforeEach(async () => {
  await resetDatabase(db);
});

describe("seed:base", () => {
  it("loads the reference list, settings and reminder rules only — no person, no account", async () => {
    await seedBase(db);
    await seedBase(db);
    const counts = await countRows(db);
    expect(counts).toMatchObject({
      reference_items: 24,
      settings: 24,
      reminder_rules: 8,
      persons: 0,
      users: 0,
    });
    expect(counts.audit_logs).toBe(0);
  });
});

describe("seed:base and edited settings", () => {
  it("never overwrites a setting edited by TOPAZE", async () => {
    await seedBase(db);
    await db.setting.update({ where: { key: "UL_NAME" }, data: { value: "UL modifiée (fictif)" } });
    await seedBase(db);
    expect((await db.setting.findUniqueOrThrow({ where: { key: "UL_NAME" } })).value).toBe(
      "UL modifiée (fictif)",
    );
  });
});

describe("seed:demo", () => {
  it("refuses a database holding a person that is not seed data, and writes nothing", async () => {
    await seedBase(db);
    await db.person.create({
      data: { firstName: "Vraie", lastName: "Personne", notes: "Importée" },
    });
    await expect(seedDemo(db, { today })).rejects.toBeInstanceOf(RealDataPresentError);
    await expect(seedDemo(db, { today })).rejects.toThrow(
      /1 personne\(s\) sans la note « Donnée fictive \(seed\) »/,
    );
    expect(await db.user.count()).toBe(0);
    expect(await db.person.count()).toBe(1);
  });

  it("treats a person without notes as real data", async () => {
    await db.person.create({ data: { firstName: "Sans", lastName: "Note" } });
    await expect(seedDemo(db, { today })).rejects.toBeInstanceOf(RealDataPresentError);
  });

  it("on a hosted demo, keeps and lists the people created outside the seed", async () => {
    await seedBase(db);
    const typed = await db.person.create({
      data: { firstName: "Saisie", lastName: "Testeur", notes: "Créée dans la démo" },
    });
    const { foreignPeople } = await seedDemo(db, { today, hostedDemo: true });
    expect(foreignPeople.map((p) => p.ref)).toEqual([typed.ref]);
    expect(await db.person.count()).toBe(SEED_VOLUMES.persons + 1);
    const after = await db.person.findUniqueOrThrow({ where: { id: typed.id } });
    expect(after).toEqual(typed);
    // Still strict everywhere else.
    await expect(seedDemo(db, { today })).rejects.toBeInstanceOf(RealDataPresentError);
    // Idempotent on the demo too.
    const first = await countRows(db);
    await seedDemo(db, { today, hostedDemo: true });
    expect(await countRows(db)).toEqual(first);
  });

  it("runs on top of the base seed and stays idempotent", async () => {
    await seedBase(db);
    await seedDemo(db, { today });
    const first = await countRows(db);
    await seedDemo(db, { today });
    expect(await countRows(db)).toEqual(first);
    expect(first.persons).toBe(SEED_VOLUMES.persons);
  });
});
