import { describe, expect, it } from "vitest";
import { perimetersOf } from "@/server/perimeter";
import { makePerson, makeReference, testNivol } from "@/test/db/factories";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-04T00:00:00.000Z");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("perimetersOf (query)", () => {
  it("derives perimeters from passed trainings and active appointments", async () => {
    const person = await makePerson(db, { status: "ACTIVE", nivol: testNivol() });
    const pse = await makeReference(db, { perimeters: ["ACTION", "LASER"] });
    const tcau = await makeReference(db, { perimeters: ["LASER"] });
    const fpsc = await makeReference(db, { perimeters: ["FORMAT_GP"] });
    const assist = await makeReference(db, {
      kind: "FUNCTION",
      category: "FORMATION_GP",
      perimeters: ["FORMAT_GP"],
    });
    const plain = await makeReference(db);

    await db.trainingRecord.createMany({
      data: [
        { personId: person.id, referenceId: pse.id, result: "REGISTERED" },
        {
          personId: person.id,
          referenceId: tcau.id,
          result: "PASSED",
          date: d("2023-01-01"),
          expiresAt: d("2026-01-01"),
        },
        { personId: person.id, referenceId: plain.id, result: "PASSED" },
        { personId: person.id, referenceId: fpsc.id, result: "PASSED", cancelledAt: new Date() },
      ],
    });
    await db.appointment.create({
      data: {
        personId: person.id,
        referenceId: assist.id,
        startDate: d("2025-01-01"),
        cancelledAt: new Date(),
      },
    });
    expect([...(await perimetersOf(db, person.id, day))]).toEqual([]);

    await db.trainingRecord.create({
      data: { personId: person.id, referenceId: pse.id, result: "PASSED", expiresAt: null },
    });
    await db.appointment.create({
      data: { personId: person.id, referenceId: assist.id, startDate: d("2025-01-01") },
    });
    expect([...(await perimetersOf(db, person.id, day))].sort()).toEqual([
      "ACTION",
      "FORMAT_GP",
      "LASER",
    ]);
  });

  it("gives FORMAT_GP to a person flagged as trainer, without any training", async () => {
    const trainer = await makePerson(db, { status: "ACTIVE", nivol: testNivol(), isTrainer: true });
    const unknown = await makePerson(db, { status: "ACTIVE", nivol: testNivol(), isTrainer: null });
    expect([...(await perimetersOf(db, trainer.id, day))]).toEqual(["FORMAT_GP"]);
    expect([...(await perimetersOf(db, unknown.id, day))]).toEqual([]);
  });
});
