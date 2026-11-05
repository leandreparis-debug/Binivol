/**
 * Build step of a hosted demo (ADR-035): seeds the fictitious demo data when,
 * and only when, the deployment is a hosted demo (AUTH_DEMO_LOGIN=true,
 * AUTH_DEMO_ON_VERCEL=true, VERCEL_ENV set). Does nothing otherwise, so a
 * real deployment never receives demo data. Idempotent; `seedDemo` also
 * refuses a database that holds non-seed people.
 */
import "dotenv/config";
import { isHostedDemo, parseEnv } from "../src/lib/env";
import { createDb } from "../src/server/db";
import { seedDemo } from "../prisma/seed/index";

async function main() {
  const env = parseEnv(process.env);
  // Second guard, besides the build plan: production deployments only.
  if (!isHostedDemo(env) || process.env.VERCEL_ENV !== "production") {
    process.stdout.write("Démo hébergée inactive : aucun seed de démonstration.\n");
    return;
  }
  // The application URL (pg driver); DIRECT_URL serves the Prisma migrations only.
  const url = env.DATABASE_URL ?? env.DIRECT_URL;
  if (!url) throw new Error("DIRECT_URL ou DATABASE_URL manquant.");
  const db = createDb(url);
  try {
    await seedDemo(db);
    process.stdout.write("Seed de démonstration appliqué (données fictives).\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
