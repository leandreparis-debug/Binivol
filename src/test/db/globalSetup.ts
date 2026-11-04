import { execFileSync } from "node:child_process";
import { createDb } from "@/server/db";
import { resolveTestDatabaseUrl } from "./testDatabase";

/**
 * Runs once before the `db` project: recreates the `public` schema of the
 * test database and applies every migration with `prisma migrate deploy`,
 * exactly as in production.
 */
export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();
  const db = createDb(url);
  try {
    await db.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
    await db.$executeRawUnsafe("CREATE SCHEMA public");
  } finally {
    await db.$disconnect();
  }
  const { SHADOW_DATABASE_URL: _unused, ...env } = process.env;
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...env, DATABASE_URL: url, DIRECT_URL: url },
    stdio: ["ignore", "ignore", "inherit"],
  });
}
