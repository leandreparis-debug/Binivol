/**
 * `pnpm db:backup` (step 14, docs/sauvegarde.md): `pg_dump` (custom format)
 * of DIRECT_URL (else DATABASE_URL), encrypted with AES-256-GCM
 * (BACKUP_ENCRYPTION_KEY), written to BACKUP_DIR (./backups) with a dated
 * name; only the BACKUP_KEEP (8) most recent copies are kept. Read-only on
 * the database. The password goes through PGPASSWORD, never the command line.
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  backupFileName,
  backupsToDelete,
  encryptBackup,
  parseBackupKey,
  pgConnection,
} from "../src/server/maintenance/backup";

function main(): void {
  const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL est absente.");
  const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
  const dir = resolve(process.env.BACKUP_DIR ?? "./backups");
  const keep = Number.parseInt(process.env.BACKUP_KEEP ?? "8", 10) || 8;
  const { url, password } = pgConnection(databaseUrl);
  const dump = execFileSync(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-acl", `--dbname=${url}`],
    {
      env: { ...process.env, ...(password ? { PGPASSWORD: password } : {}) },
      maxBuffer: 1024 * 1024 * 1024,
    },
  );
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = backupFileName(new Date());
  writeFileSync(join(dir, name), encryptBackup(dump, key), { mode: 0o600 });
  for (const old of backupsToDelete(readdirSync(dir), keep)) rmSync(join(dir, old));
  process.stdout.write(
    `Sauvegarde chiffrée : ${join(dir, name)} (${String(dump.length)} octets avant chiffrement).\n`,
  );
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
