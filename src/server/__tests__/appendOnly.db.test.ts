import { describe, expect, it } from "vitest";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();

describe.each([
  ["audit_logs", () => db.auditLog.create({ data: { action: "LOGIN", entity: "User" } })],
  ["access_logs", () => db.accessLog.create({ data: { scope: "SENSITIVE_VIEW" } })],
] as const)("%s is append-only", (table, insert) => {
  it("accepts inserts", async () => {
    await expect(insert()).resolves.toBeTruthy();
  });

  it("refuses UPDATE with an explicit message", async () => {
    await insert();
    await expect(db.$executeRawUnsafe(`UPDATE ${table} SET at = now()`)).rejects.toThrow(
      new RegExp(`${table} est en ajout seul : UPDATE interdit`),
    );
  });

  it("refuses DELETE, even when no row matches", async () => {
    await expect(db.$executeRawUnsafe(`DELETE FROM ${table}`)).rejects.toThrow(/DELETE interdit/);
    await expect(db.$executeRawUnsafe(`DELETE FROM ${table} WHERE id = 'absent'`)).rejects.toThrow(
      /DELETE interdit/,
    );
  });

  it("refuses TRUNCATE", async () => {
    await expect(db.$executeRawUnsafe(`TRUNCATE ${table}`)).rejects.toThrow(/TRUNCATE interdit/);
  });

  it("allows deletion only inside a transaction that sets binivol.allow_purge", async () => {
    await insert();
    const deleted = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL binivol.allow_purge = 'on'");
      return tx.$executeRawUnsafe(`DELETE FROM ${table}`);
    });
    expect(deleted).toBeGreaterThan(0);
    // SET LOCAL does not leak out of its transaction.
    await insert();
    await expect(db.$executeRawUnsafe(`DELETE FROM ${table}`)).rejects.toThrow(/DELETE interdit/);
  });

  it("is not unlocked by another value of the setting", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL binivol.allow_purge = 'yes'");
        return tx.$executeRawUnsafe(`DELETE FROM ${table}`);
      }),
    ).rejects.toThrow(/DELETE interdit/);
  });
});
