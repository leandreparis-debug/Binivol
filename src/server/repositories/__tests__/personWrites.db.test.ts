import { describe, expect, it } from "vitest";
import { personRepository } from "@/server/repositories/personRepository";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const actor = { userId: "user_import", label: "Import" };

describe("personRepository writes go through withAudit", () => {
  it("create writes a CREATE audit entry in the same transaction", async () => {
    const created = await personRepository(db).create(
      { firstName: "Écrite", lastName: "Auditée" },
      actor,
    );
    const entries = await db.auditLog.findMany({
      where: { entity: "Person", entityId: created.id },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "CREATE",
      actorId: "user_import",
      actorLabel: "Import",
    });
    expect((await db.person.findUniqueOrThrow({ where: { id: created.id } })).createdById).toBe(
      "user_import",
    );
  });

  it("update writes one entry per changed field", async () => {
    const created = await personRepository(db).create(
      { firstName: "Avant", lastName: "Modif" },
      actor,
    );
    await personRepository(db).update(created.id, { firstName: "Après", lastName: "Modif" }, actor);
    const updates = await db.auditLog.findMany({
      where: { entityId: created.id, action: "UPDATE" },
    });
    expect(updates.map((u) => [u.field, u.oldValue, u.newValue])).toEqual([
      ["firstName", "Avant", "Après"],
    ]);
  });

  it("a refused write leaves no audit entry", async () => {
    const before = await db.auditLog.count();
    await expect(
      personRepository(db).create({ firstName: "X", lastName: "Y", nivol: "faux" }, actor),
    ).rejects.toMatchObject({
      code: "NIVOL_INVALID",
    });
    expect(await db.auditLog.count()).toBe(before);
  });
});
