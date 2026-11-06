import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Encrypted backups (step 14, docs/sauvegarde.md). Pure helpers of the
 * `db:backup` / `db:restore` scripts: AES-256-GCM with a key read from the
 * environment (`BACKUP_ENCRYPTION_KEY`, never in a file of the repository),
 * dated names, rotation of the last `BACKUP_KEEP` copies.
 *
 * File format: `BNVBK1` (6 bytes) + IV (12) + tag (16) + ciphertext.
 */

const MAGIC = Buffer.from("BNVBK1", "ascii");
export const BACKUP_PATTERN = /^binivol-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.dump\.enc$/;

/** 32-byte key from 64 hex characters or base64. */
export function parseBackupKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error("BACKUP_ENCRYPTION_KEY est absente (32 octets, hex ou base64).");
  const value = raw.trim();
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32) throw new Error("BACKUP_ENCRYPTION_KEY doit faire 32 octets.");
  return key;
}

export function encryptBackup(plain: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), body]);
}

export function decryptBackup(file: Buffer, key: Buffer): Buffer {
  if (!file.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Binivol.");
  }
  const iv = file.subarray(6, 18);
  const tag = file.subarray(18, 34);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(file.subarray(34)), decipher.final()]);
}

/** `binivol-2026-11-06T05-00-00Z.dump.enc` (UTC, sortable). */
export function backupFileName(at: Date): string {
  return `binivol-${at.toISOString().slice(0, 19).replace(/:/g, "-")}Z.dump.enc`;
}

/** Files to delete so that only the `keep` most recent backups remain. */
export function backupsToDelete(files: readonly string[], keep: number): string[] {
  return files
    .filter((f) => BACKUP_PATTERN.test(f))
    .sort()
    .reverse()
    .slice(Math.max(1, keep));
}

/** Connection settings without the password (passed through PGPASSWORD, never on the command line). */
export function pgConnection(databaseUrl: string): { url: string; password: string | null } {
  const url = new URL(databaseUrl);
  const password = url.password ? decodeURIComponent(url.password) : null;
  url.password = "";
  return { url: url.toString(), password };
}
