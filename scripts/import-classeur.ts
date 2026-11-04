/**
 * Import of the legacy workbook from the command line (operations):
 *
 *   pnpm import:classeur <fichier.xlsx> --dry-run   simulation, writes nothing
 *   pnpm import:classeur <fichier.xlsx>             real import (needs a simulation
 *                                                   of the same file < 30 min)
 *
 * Reads DATABASE_URL. Runs are recorded with actorLabel « CLI ». Same rules
 * as the /admin/import screen (src/server/import/service.ts).
 */
import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { getEnv } from "../src/lib/env";
import { createDb } from "../src/server/db";
import { IMPORT_ORDER } from "../src/server/import/columns";
import { MAX_IMPORT_BYTES } from "../src/server/import/file";
import { LEVEL_LABELS, SHEET_LABELS, totals } from "../src/server/import/report";
import { runImport } from "../src/server/import/service";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Usage : pnpm import:classeur <fichier.xlsx> [--dry-run]");
  const info = await stat(file);
  if (info.size > MAX_IMPORT_BYTES)
    throw new Error("Le fichier dépasse la taille maximale de 5 Mo.");
  const buffer = await readFile(file);
  const url = getEnv().DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL est absente (voir .env.example).");

  const db = createDb(url);
  try {
    const outcome = await runImport(db, {
      actor: { userId: null, label: "CLI" },
      fileName: path.basename(file),
      buffer,
      dryRun,
    });
    const report = outcome.report;
    const out: string[] = [
      `${dryRun ? "Simulation" : "Import réel"} de ${path.basename(file)} (run ${outcome.runId})`,
    ];
    if (report) {
      out.push(
        "",
        "Onglet        Créées  Mises à jour  Inchangées  Conflits  Rejetées  Avertissements",
      );
      for (const sheet of IMPORT_ORDER) {
        const c = report.counts[sheet];
        out.push(
          `${SHEET_LABELS[sheet].padEnd(12)}  ${String(c.created).padStart(6)}  ${String(c.updated).padStart(12)}  ${String(c.unchanged).padStart(10)}  ${String(c.conflicts).padStart(8)}  ${String(c.rejected).padStart(8)}  ${String(c.warnings).padStart(14)}`,
        );
      }
      const t = totals(report.counts);
      out.push(
        `${"Total".padEnd(12)}  ${String(t.created).padStart(6)}  ${String(t.updated).padStart(12)}  ${String(t.unchanged).padStart(10)}  ${String(t.conflicts).padStart(8)}  ${String(t.rejected).padStart(8)}  ${String(t.warnings).padStart(14)}`,
        "",
        `Personnes créées ou mises à jour : ${report.personCount}`,
      );
      if (report.issues.length > 0) {
        out.push("", "Rejets, conflits et avertissements :");
        for (const i of report.issues) {
          out.push(
            `- [${LEVEL_LABELS[i.level]}] ${i.sheet}${i.row ? ` ligne ${i.row}` : ""}${i.key ? ` (${i.key})` : ""} : ${i.message}`,
          );
        }
      }
    }
    if (outcome.error) out.push("", `ÉCHEC : ${outcome.error}`);
    process.stdout.write(`${out.join("\n")}\n`);
    if (!outcome.ok) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
