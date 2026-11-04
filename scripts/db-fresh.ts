/**
 * `pnpm db:fresh`: drops and recreates the LOCAL database of DATABASE_URL,
 * then runs `db:deploy` and `db:seed:demo`. Refuses any non-local host and
 * NODE_ENV=production (see src/server/maintenance/freshGuard.ts).
 */
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { createDb } from "../src/server/db";
import { checkFreshTarget } from "../src/server/maintenance/freshGuard";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  const target = checkFreshTarget(url, process.env.NODE_ENV);
  if (!target.ok || !url) throw new Error(target.ok ? "DATABASE_URL est absente." : target.reason);

  const maintenance = new URL(url);
  maintenance.pathname = "/postgres";
  const admin = createDb(maintenance.toString());
  try {
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${target.database}" WITH (FORCE)`);
    await admin.$executeRawUnsafe(`CREATE DATABASE "${target.database}"`);
  } finally {
    await admin.$disconnect();
  }
  process.stdout.write(`Base « ${target.database} » recréée sur ${target.host}.\n`);

  const { SHADOW_DATABASE_URL: _unused, ...inherited } = process.env;
  const env = { ...inherited, DATABASE_URL: url, DIRECT_URL: url };
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { env, stdio: "inherit" });
  execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts", "demo"], { env, stdio: "inherit" });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
