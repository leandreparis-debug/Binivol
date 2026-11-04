import "dotenv/config";
import { execFileSync } from "node:child_process";

/**
 * Recreates the e2e database before the run (`pnpm db:fresh`: drop, migrate,
 * demo seed), so every run starts from the same synthetic data. db:fresh
 * refuses any non-local host.
 */
export default function globalSetup(): void {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL ou DATABASE_URL est requise pour les tests e2e.");
  const { SHADOW_DATABASE_URL: _unused, ...inherited } = process.env;
  execFileSync("pnpm", ["--silent", "db:fresh"], {
    env: { ...inherited, DATABASE_URL: url, DIRECT_URL: url },
    stdio: ["ignore", "ignore", "inherit"],
  });
}
