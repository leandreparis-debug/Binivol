import { describe, expect, it } from "vitest";
import { nextRef, parseRef } from "@/server/sequences";
import { makePerson, makeReference } from "@/test/db/factories";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const numbers = (refs: string[]) => refs.map((r) => parseRef(r)?.value ?? -1).sort((a, b) => a - b);

describe("readable numbers", () => {
  it("gives distinct, increasing refs to 20 concurrent creations", async () => {
    const people = await Promise.all(Array.from({ length: 20 }, () => makePerson(db)));
    const refs = people.map((p) => p.ref);
    expect(new Set(refs).size).toBe(20);
    expect(refs.every((r) => /^P-\d{5}$/.test(r))).toBe(true);
    const sorted = numbers(refs);
    const first = sorted[0] ?? 0;
    expect(sorted).toEqual(Array.from({ length: 20 }, (_, i) => first + i));
  });

  it("reserves distinct numbers concurrently with nextRef", async () => {
    const refs = await Promise.all(Array.from({ length: 20 }, () => nextRef(db, "trainingRecord")));
    expect(new Set(refs).size).toBe(20);
    expect(refs.every((r) => r.startsWith("S-"))).toBe(true);
    const next = await nextRef(db, "trainingRecord");
    expect(parseRef(next)?.value).toBeGreaterThan(Math.max(...numbers(refs)));
  });

  it("uses one sequence per entity", async () => {
    const person = await makePerson(db);
    const reference = await makeReference(db);
    const record = await db.trainingRecord.create({
      data: { personId: person.id, referenceId: reference.id },
    });
    expect(record.ref).toMatch(/^S-\d{5}$/);
    expect(await nextRef(db, "appointment")).toBe("F-00001");
  });
});
