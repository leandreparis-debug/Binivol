import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  backupFileName,
  backupsToDelete,
  decryptBackup,
  encryptBackup,
  parseBackupKey,
  pgConnection,
} from "../backup";

describe("encrypted backups", () => {
  const key = randomBytes(32);

  it("round trip, and refuses a wrong key or a tampered file", () => {
    const plain = Buffer.from("PGDMP fictif");
    const file = encryptBackup(plain, key);
    expect(file.includes(plain)).toBe(false);
    expect(decryptBackup(file, key)).toEqual(plain);
    expect(() => decryptBackup(file, randomBytes(32))).toThrow();
    const tampered = Buffer.from(file);
    tampered.writeUInt8((tampered.at(-1) ?? 0) ^ 1, tampered.length - 1);
    expect(() => decryptBackup(tampered, key)).toThrow();
    expect(() => decryptBackup(Buffer.from("autre chose"), key)).toThrow(/pas une sauvegarde/);
  });

  it("key from the environment: hex or base64, 32 bytes, never absent", () => {
    expect(parseBackupKey(key.toString("hex"))).toEqual(key);
    expect(parseBackupKey(key.toString("base64"))).toEqual(key);
    expect(() => parseBackupKey(undefined)).toThrow(/absente/);
    expect(() => parseBackupKey("court")).toThrow(/32 octets/);
  });

  it("dated names and rotation of the last N copies", () => {
    expect(backupFileName(new Date("2026-11-06T05:00:00.000Z"))).toBe(
      "binivol-2026-11-06T05-00-00Z.dump.enc",
    );
    const files = [1, 2, 3, 4].map((d) => backupFileName(new Date(Date.UTC(2026, 10, d))));
    expect(backupsToDelete([...files, "notes.txt"], 2)).toEqual([files[1], files[0]]);
    expect(backupsToDelete(files, 0)).toHaveLength(3);
  });

  it("the password never goes on the command line", () => {
    expect(pgConnection("postgresql://u:s%40cret@localhost:5432/binivol")).toEqual({
      url: "postgresql://u@localhost:5432/binivol",
      password: "s@cret",
    });
  });
});
