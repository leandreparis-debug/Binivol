import type { DbOrTx } from "../db";
import { storedReport } from "./service";
import { totals, type SheetCounts } from "./report";

export interface ImportRunSummary {
  id: string;
  startedAt: string;
  actorLabel: string;
  fileName: string;
  dryRun: boolean;
  status: "RUNNING" | "SUCCEEDED" | "FAILED";
  blocking: boolean;
  totals: SheetCounts | null;
  error: string | null;
}

/** Latest import runs (simulations and real imports), newest first. */
export async function listImportRuns(db: DbOrTx, take = 20): Promise<ImportRunSummary[]> {
  const runs = await db.importRun.findMany({ orderBy: { startedAt: "desc" }, take });
  return runs.map((run) => {
    const report = storedReport(run.report);
    return {
      id: run.id,
      startedAt: run.startedAt.toISOString(),
      actorLabel: run.actorLabel,
      fileName: run.fileName,
      dryRun: run.dryRun,
      status: run.status,
      blocking: run.blocking,
      totals: report ? totals(report.counts) : null,
      error: run.error,
    };
  });
}

/** One run with its stored report (CSV download). */
export async function getImportRun(db: DbOrTx, id: string) {
  const run = await db.importRun.findUnique({ where: { id } });
  return run ? { ...run, parsedReport: storedReport(run.report) } : null;
}
