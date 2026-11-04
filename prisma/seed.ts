/**
 * Entry point of `pnpm db:seed` (`prisma db seed`). Fills the database pointed
 * to by DATABASE_URL (or DIRECT_URL) with the synthetic data set, then prints
 * the row count of every table. Safe to run several times.
 */
import "dotenv/config";
import { createDb } from "../src/server/db";
import { countRows, seed } from "./seed/index";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? process.env.DIRECT_URL;
  if (!url) {
    throw new Error("DATABASE_URL est absente : impossible de lancer le seed (voir .env.example).");
  }
  const db = createDb(url);
  try {
    const started = Date.now();
    await seed(db);
    const counts = await countRows(db);
    const width = Math.max(...Object.keys(counts).map((k) => k.length));
    const lines = Object.entries(counts).map(
      ([table, n]) => `  ${table.padEnd(width)}  ${String(n).padStart(4)}`,
    );
    process.stdout.write(
      `Seed synthétique appliqué en ${Date.now() - started} ms (données fictives uniquement).\n${lines.join("\n")}\n`,
    );
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
