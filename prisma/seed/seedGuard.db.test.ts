import { beforeEach, describe, expect, it } from "vitest";
import { getTestDb, resetDatabase } from "@/test/db/testDatabase";
import { countRows, RealDataPresentError, seedBase, seedDemo } from "./index";

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
      settings: 7,
      reminder_rules: 6,
      persons: 0,
      users: 0,
    });
    expect(counts.audit_logs).toBe(0);
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

  it("runs on top of the base seed and stays idempotent", async () => {
    await seedBase(db);
    await seedDemo(db, { today });
    const first = await countRows(db);
    await seedDemo(db, { today });
    expect(await countRows(db)).toEqual(first);
    expect(first.persons).toBe(60);
  });
});
