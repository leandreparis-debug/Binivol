/**
 * Build step of a hosted demo (ADR-035): seeds the fictitious demo data when,
 * and only when, the deployment is a hosted demo (AUTH_DEMO_LOGIN=true,
 * AUTH_DEMO_ON_VERCEL=true, VERCEL_ENV set). Does nothing otherwise, so a
 * real deployment never receives demo data. Idempotent; `seedDemo` also
 * refuses a database that holds non-seed people, except on a hosted demo
 * where they are kept and listed (ADR-042).
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
    // A hosted demo is fictitious by definition (ADR-042): people typed by the
    // testers are kept untouched and listed (refs only), the seed runs as usual.
    const { foreignPeople } = await seedDemo(db, { hostedDemo: true });
    if (foreignPeople.length > 0) {
      process.stdout.write(
        `Démo hébergée : ${String(foreignPeople.length)} personne(s) créée(s) hors seed, conservée(s) telle(s) quelle(s) : ${foreignPeople.map((p) => p.ref).join(", ")}.\n`,
      );
    }
    process.stdout.write("Seed de démonstration appliqué (données fictives).\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
