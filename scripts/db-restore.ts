/**
 * `pnpm db:restore <fichier.dump.enc>` (step 14): decrypts a backup and
 * restores it into the **local** database of DATABASE_URL (same guard as
 * db:fresh: any other host is refused, and NODE_ENV=production too).
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decryptBackup, parseBackupKey, pgConnection } from "../src/server/maintenance/backup";
import { checkFreshTarget } from "../src/server/maintenance/freshGuard";

function main(): void {
  const file = process.argv[2];
  if (!file) throw new Error("Usage : pnpm db:restore <fichier.dump.enc>");
  const databaseUrl = process.env.DATABASE_URL;
  const target = checkFreshTarget(databaseUrl, process.env.NODE_ENV);
  if (!target.ok || !databaseUrl) {
    throw new Error(
      target.ok ? "DATABASE_URL est absente." : target.reason.replace("db:fresh", "db:restore"),
    );
  }
  const key = parseBackupKey(process.env.BACKUP_ENCRYPTION_KEY);
  const dump = decryptBackup(readFileSync(file), key);
  const dir = mkdtempSync(join(tmpdir(), "binivol-restore-"));
  const path = join(dir, "restore.dump");
  try {
    writeFileSync(path, dump, { mode: 0o600 });
    const { url, password } = pgConnection(databaseUrl);
    execFileSync(
      "pg_restore",
      ["--clean", "--if-exists", "--no-owner", "--no-acl", `--dbname=${url}`, path],
      { env: { ...process.env, ...(password ? { PGPASSWORD: password } : {}) }, stdio: "inherit" },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  process.stdout.write(`Sauvegarde restaurée dans « ${target.database} » (${target.host}).\n`);
}

try {
  main();
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
