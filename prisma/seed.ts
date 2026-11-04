/**
 * Entry point of the seeds:
 *   tsx prisma/seed.ts base   reference list, settings, reminder rules (production-safe)
 *   tsx prisma/seed.ts demo   base + demo accounts + 60 fictitious people (default)
 * Reads DATABASE_URL (or DIRECT_URL) and prints the row count of every table.
 */
import "dotenv/config";
import { createDb } from "../src/server/db";
import { countRows, seedBase, seedDemo } from "./seed/index";

async function main(): Promise<void> {
  const mode = process.argv[2] ?? "demo";
  if (mode !== "base" && mode !== "demo") throw new Error("Usage : tsx prisma/seed.ts [base|demo]");
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) {
    throw new Error("DATABASE_URL est absente : impossible de lancer le seed (voir .env.example).");
  }
  const db = createDb(url);
  try {
    const started = Date.now();
    if (mode === "base") await seedBase(db);
    else await seedDemo(db);
    const counts = await countRows(db);
    const width = Math.max(...Object.keys(counts).map((k) => k.length));
    const lines = Object.entries(counts).map(
      ([table, n]) => `  ${table.padEnd(width)}  ${String(n).padStart(4)}`,
    );
    const title =
      mode === "base"
        ? "Seed de base appliqué (référentiel, paramètres, règles de rappel)"
        : "Seed de démonstration appliqué (données fictives uniquement)";
    process.stdout.write(`${title} en ${Date.now() - started} ms.\n${lines.join("\n")}\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
