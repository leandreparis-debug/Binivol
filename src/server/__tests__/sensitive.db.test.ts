import { beforeEach, describe, expect, it } from "vitest";
import type { Profile } from "@/generated/prisma/enums";
import { ForbiddenError } from "@/server/policy/can";
import { readDocument, readPersonSensitive } from "@/server/sensitive";
import { makePerson, testNivol } from "@/test/db/factories";
import { getTestDb, resetDatabase } from "@/test/db/testDatabase";

const db = getTestDb();
const actor = (...profiles: Profile[]) => ({
  userId: "user_x",
  name: "Test",
  email: "t@binivol.test",
  profiles: new Set(profiles),
});

async function personWithSensitiveData() {
  const person = await makePerson(db, {
    status: "ACTIVE",
    nivol: testNivol(),
    entryDate: new Date("2026-09-01"),
  });
  await db.personSensitive.create({
    data: { personId: person.id, birthDate: new Date("2001-02-03"), city: "Versailles" },
  });
  await db.emergencyContact.create({
    data: { personId: person.id, lastName: "Contact", phone1: "06 39 98 00 00" },
  });
  const doc = await db.document.create({
    data: {
      personId: person.id,
      kind: "DOSSIER",
      storageKey: `seed/${person.id}`,
      fileName: "f.pdf",
      mimeType: "application/pdf",
      sizeBytes: 0,
      sha256: "a".repeat(64),
      fileMissing: true,
    },
  });
  return { person, doc };
}

beforeEach(async () => {
  await resetDatabase(db);
});

describe("readPersonSensitive", () => {
  it("returns the data and writes a SENSITIVE_VIEW access log in the same transaction", async () => {
    const { person } = await personWithSensitiveData();
    const view = await readPersonSensitive(db, actor("TOPAZE"), person.id, "fiche:/benevoles/x");
    expect(view.city).toBe("Versailles");
    expect(view.emergencyContacts).toHaveLength(1);
    expect(await db.accessLog.findMany()).toEqual([
      expect.objectContaining({
        userId: "user_x",
        personId: person.id,
        scope: "SENSITIVE_VIEW",
        context: "fiche:/benevoles/x",
      }),
    ]);
  });

  it("writes nothing when the transaction fails", async () => {
    const { person } = await personWithSensitiveData();
    await expect(
      db.$transaction(async (tx) => {
        await readPersonSensitive(tx, actor("TOPAZE"), person.id, "test");
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await db.accessLog.count()).toBe(0);
  });

  it("refuses FORMAT alone, without writing any access log", async () => {
    const { person } = await personWithSensitiveData();
    await expect(
      readPersonSensitive(db, actor("FORMAT"), person.id, "test"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.accessLog.count()).toBe(0);
  });

  it("lets DIAMANT read a new volunteer, not ACTION without perimeter", async () => {
    const { person } = await personWithSensitiveData();
    await expect(
      readPersonSensitive(db, actor("DIAMANT"), person.id, "test"),
    ).resolves.toBeTruthy();
    await expect(
      readPersonSensitive(db, actor("ACTION"), person.id, "test"),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(await db.accessLog.count()).toBe(1);
  });
});

describe("readDocument", () => {
  it("journals DOCUMENT_VIEW, and refuses without journaling", async () => {
    const { doc, person } = await personWithSensitiveData();
    expect((await readDocument(db, actor("TOPAZE"), doc.id, "dossier")).fileName).toBe("f.pdf");
    await expect(readDocument(db, actor("FORMAT"), doc.id, "dossier")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await db.accessLog.findMany({ select: { scope: true, personId: true } })).toEqual([
      { scope: "DOCUMENT_VIEW", personId: person.id },
    ]);
  });
});
