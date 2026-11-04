import { beforeEach, describe, expect, it } from "vitest";
import { loadFunctionFacts, loadPersonFacts } from "@/server/policy/facts";
import { makePerson, makeReference, testNivol } from "@/test/db/factories";
import { getTestDb, resetDatabase } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-04T00:00:00.000Z");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const active = () => ({ status: "ACTIVE" as const, nivol: testNivol() });

beforeEach(async () => {
  await resetDatabase(db);
});

describe("loadPersonFacts", () => {
  it("returns null for an unknown person", async () => {
    expect(await loadPersonFacts(db, "absent", day)).toBeNull();
  });

  it("a long-standing volunteer is outside the DIAMANT scope", async () => {
    const p = await makePerson(db, { ...active(), entryDate: d("2020-01-01") });
    expect(await loadPersonFacts(db, p.id, day)).toMatchObject({
      status: "ACTIVE",
      inDiamantScope: false,
      archived: false,
    });
  });

  it("a candidate is in the DIAMANT scope", async () => {
    const p = await makePerson(db, { status: "CANDIDATE" });
    expect((await loadPersonFacts(db, p.id, day))?.inDiamantScope).toBe(true);
  });

  it("an open candidacy puts a volunteer in the DIAMANT scope", async () => {
    const p = await makePerson(db, { ...active(), entryDate: d("2020-01-01") });
    await db.candidacy.create({ data: { personId: p.id } });
    expect((await loadPersonFacts(db, p.id, day))?.inDiamantScope).toBe(true);
  });

  it("uses NEW_VOLUNTEER_MONTHS (12 by default) for new volunteers", async () => {
    const recent = await makePerson(db, { ...active(), entryDate: d("2026-01-15") });
    const older = await makePerson(db, { ...active(), entryDate: d("2025-10-01") });
    expect((await loadPersonFacts(db, recent.id, day))?.inDiamantScope).toBe(true);
    expect((await loadPersonFacts(db, older.id, day))?.inDiamantScope).toBe(false);
    await db.setting.create({ data: { key: "NEW_VOLUNTEER_MONTHS", value: 6 } });
    expect((await loadPersonFacts(db, recent.id, day))?.inDiamantScope).toBe(false);
  });

  it("a current mentorship as mentee counts, an ended one does not", async () => {
    const mentor = await makePerson(db, { ...active(), entryDate: d("2015-01-01") });
    const mentee = await makePerson(db, { ...active(), entryDate: d("2020-01-01") });
    const done = await makePerson(db, { ...active(), entryDate: d("2020-01-01") });
    await db.mentorship.create({
      data: { menteeId: mentee.id, mentorId: mentor.id, startDate: d("2026-10-01") },
    });
    await db.mentorship.create({
      data: {
        menteeId: done.id,
        mentorId: mentor.id,
        startDate: d("2025-01-01"),
        endDate: d("2025-06-01"),
      },
    });
    expect((await loadPersonFacts(db, mentee.id, day))?.inDiamantScope).toBe(true);
    expect((await loadPersonFacts(db, done.id, day))?.inDiamantScope).toBe(false);
    expect((await loadPersonFacts(db, mentor.id, day))?.inDiamantScope).toBe(false);
  });

  it("reports archives and perimeters (trainer flag included)", async () => {
    const pse = await makeReference(db, { perimeters: ["ACTION", "LASER"] });
    const p = await makePerson(db, { ...active(), archivedAt: new Date(), isTrainer: true });
    await db.trainingRecord.create({
      data: { personId: p.id, referenceId: pse.id, result: "PASSED" },
    });
    const facts = await loadPersonFacts(db, p.id, day);
    expect(facts?.archived).toBe(true);
    expect([...(facts?.perimeters ?? [])].sort()).toEqual(["ACTION", "FORMAT_GP", "LASER"]);
  });
});

describe("loadFunctionFacts", () => {
  it("returns managedBy for a function, null for a training", async () => {
    const fn = await makeReference(db, {
      kind: "FUNCTION",
      category: "SECOURS",
      managedBy: ["LASER"],
    });
    const training = await makeReference(db);
    expect(await loadFunctionFacts(db, fn.id)).toEqual({ code: fn.code, managedBy: ["LASER"] });
    expect(await loadFunctionFacts(db, training.id)).toBeNull();
  });

  it("refuses managedBy on a training (CHECK)", async () => {
    await expect(makeReference(db, { kind: "TRAINING", managedBy: ["ACTION"] })).rejects.toThrow(
      /reference_items_managed_by_functions_only/,
    );
  });
});
