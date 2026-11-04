import "dotenv/config";
import { execFileSync } from "node:child_process";

/**
 * Migrates and seeds the e2e database before the run (idempotent seed), so the
 * seven demo accounts exist. Accounts created by the tests use unique
 * addresses and are only deactivated, never deleted.
 */
export default function globalSetup(): void {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL ou DATABASE_URL est requise pour les tests e2e.");
  const { SHADOW_DATABASE_URL: _unused, ...inherited } = process.env;
  const env = { ...inherited, DATABASE_URL: url, DIRECT_URL: url };
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env,
    stdio: ["ignore", "ignore", "inherit"],
  });
  execFileSync("pnpm", ["exec", "tsx", "prisma/seed.ts"], {
    env,
    stdio: ["ignore", "ignore", "inherit"],
  });
}
