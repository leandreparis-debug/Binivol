import { beforeEach, describe, expect, it } from "vitest";
import { SENSITIVE_MASK, withAudit } from "@/server/audit";
import { makePerson } from "@/test/db/factories";
import { getTestDb, resetDatabase } from "@/test/db/testDatabase";

const db = getTestDb();
const actor = { userId: "user_test", label: "Testeur" };

beforeEach(async () => {
  await resetDatabase(db);
});

describe("withAudit", () => {
  it("writes the field-by-field difference", async () => {
    const person = await makePerson(db, { firstName: "Camille", status: "CANDIDATE" });
    await withAudit(db, actor, async (tx, audit) => {
      const after = await tx.person.update({
        where: { id: person.id },
        data: { firstName: "Camille", lastName: "Nouveau", status: "INACTIVE" },
      });
      expect(audit.updated("Person", person.id, person, after)).toBe(2);
    });
    const entries = await db.auditLog.findMany({ orderBy: { field: "asc" } });
    expect(
      entries.map((e) => [
        e.action,
        e.entity,
        e.entityId,
        e.field,
        e.oldValue,
        e.newValue,
        e.actorId,
        e.actorLabel,
      ]),
    ).toEqual([
      ["UPDATE", "Person", person.id, "lastName", "Fictif", "Nouveau", "user_test", "Testeur"],
      ["UPDATE", "Person", person.id, "status", "CANDIDATE", "INACTIVE", "user_test", "Testeur"],
    ]);
  });

  it("writes in the caller's transaction", async () => {
    const person = await makePerson(db);
    await expect(
      db.$transaction(async (outer) => {
        await withAudit(outer, actor, async (tx, audit) => {
          const row = await tx.person.update({
            where: { id: person.id },
            data: { lastName: "Interne" },
          });
          audit.updated("Person", person.id, person, row);
        });
        expect(await outer.auditLog.count()).toBe(1);
        throw new Error("rollback volontaire");
      }),
    ).rejects.toThrow("rollback volontaire");
    expect(await db.auditLog.count()).toBe(0);
    expect((await db.person.findUniqueOrThrow({ where: { id: person.id } })).lastName).toBe(
      "Fictif",
    );
  });

  it("writes nothing when the change fails", async () => {
    const person = await makePerson(db);
    await expect(
      withAudit(db, actor, async (tx, audit) => {
        const row = await tx.person.update({
          where: { id: person.id },
          data: { lastName: "Raté" },
        });
        audit.updated("Person", person.id, person, row);
        await tx.person.update({ where: { id: person.id }, data: { nivol: "invalide" } });
      }),
    ).rejects.toThrow(/persons_nivol_format/);
    expect(await db.auditLog.count()).toBe(0);
    expect((await db.person.findUniqueOrThrow({ where: { id: person.id } })).lastName).toBe(
      "Fictif",
    );
  });

  it("never logs sensitive values in clear", async () => {
    const person = await makePerson(db);
    await withAudit(db, actor, async (tx, audit) => {
      const created = await tx.personSensitive.create({
        data: { personId: person.id, birthDate: new Date("2001-02-03"), city: "Versailles" },
      });
      audit.created("PersonSensitive", created.id, created);
      const updated = await tx.personSensitive.update({
        where: { id: created.id },
        data: { birthDate: new Date("2001-02-04") },
      });
      audit.updated("PersonSensitive", created.id, created, updated);
    });
    const entries = await db.auditLog.findMany({ orderBy: { action: "asc" } });
    const serialized = JSON.stringify(entries);
    expect(serialized).not.toContain("2001-02");
    expect(serialized).not.toContain("Versailles");
    const update = entries.find((e) => e.action === "UPDATE");
    expect(update).toMatchObject({
      field: "birthDate",
      oldValue: SENSITIVE_MASK,
      newValue: SENSITIVE_MASK,
    });
    const create = entries.find((e) => e.action === "CREATE");
    expect(create?.newValue).toMatchObject({ birthDate: SENSITIVE_MASK, city: SENSITIVE_MASK });
  });

  it("records cancellations, archives and imports", async () => {
    await withAudit(db, { userId: null, label: "Import" }, (_tx, audit) => {
      audit.cancelled("Appointment", "a1", "Erreur de saisie");
      audit.archived("Person", "p1");
      audit.log({ action: "IMPORT", entity: "Workbook", newValue: { rows: 3 } });
      return Promise.resolve();
    });
    const actions = (await db.auditLog.findMany()).map((e) => [e.action, e.actorId, e.actorLabel]);
    expect(actions).toEqual(
      expect.arrayContaining([
        ["CANCEL", null, "Import"],
        ["ARCHIVE", null, "Import"],
        ["IMPORT", null, "Import"],
      ]),
    );
  });
});
