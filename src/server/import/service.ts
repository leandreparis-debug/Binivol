import type { Prisma } from "@/generated/prisma/client";
import { toParisDay } from "@/lib/dates";
import type { Db } from "../db";
import { DomainError } from "../errors";
import { checkXlsxFile, sha256Hex } from "./file";
import { importWorkbook, type ImportContext } from "./importer";
import { emptyCounts, totals, type ImportReport, type Issue } from "./report";
import { readWorkbook } from "./workbook";

/**
 * Import service: validation of the file, simulation, real import.
 *
 * - the file is read in memory and never stored (name, size, SHA-256 only);
 * - a real import requires a successful simulation of the **same file**
 *   (same SHA-256), by the **same account**, less than 30 minutes ago, with no
 *   blocking error;
 * - the real import runs in **one transaction** under a Postgres advisory
 *   lock: everything is written or nothing; a concurrent import is refused;
 * - every run (simulation, success, failure) is kept in `import_runs` with its
 *   report.
 */

export const SIMULATION_VALIDITY_MS = 30 * 60 * 1000;
const IMPORT_LOCK_KEY = 4_204_202_604; // arbitrary, constant: « binivol import »

export interface ImportActor {
  /** TOPAZE account, or null from the command line. */
  userId: string | null;
  /** Shown in the history: account name, or « CLI ». */
  label: string;
}

export interface ImportInput {
  actor: ImportActor;
  fileName: string;
  buffer: Buffer;
  dryRun: boolean;
  now?: Date;
  /** Test hook, see `ImportContext.afterSheet`. */
  afterSheet?: ImportContext["afterSheet"];
}

export interface ImportOutcome {
  runId: string;
  ok: boolean;
  dryRun: boolean;
  /** Present when the file could be read. */
  report: ImportReport | null;
  /** Refusal or failure message (French). */
  error: string | null;
  /** The file has blocking errors: it can be simulated but not imported. */
  blocking: boolean;
}

export class ImportBusyError extends DomainError {
  constructor() {
    super("IMPORT_BUSY", "Un autre import est déjà en cours. Réessayez dans quelques minutes.");
  }
}

function sameActor(
  run: { userId: string | null; actorLabel: string },
  actor: ImportActor,
): boolean {
  return actor.userId
    ? run.userId === actor.userId
    : run.userId === null && run.actorLabel === actor.label;
}

async function finishRun(
  db: Db,
  runId: string,
  data: {
    status: "SUCCEEDED" | "FAILED";
    report: ImportReport | null;
    error: string | null;
    blocking: boolean;
  },
) {
  await db.importRun.update({
    where: { id: runId },
    data: {
      status: data.status,
      finishedAt: new Date(),
      error: data.error,
      blocking: data.blocking,
      counts: (data.report?.counts ?? emptyCounts()) as unknown as Prisma.InputJsonValue,
      report: (data.report ?? {}) as unknown as Prisma.InputJsonValue,
      personCount: data.report?.personCount ?? 0,
    },
  });
}

/**
 * Simulates (`dryRun: true`) or runs the import of a workbook. Never throws
 * for a business reason: the outcome carries the refusal or failure, and the
 * run is recorded.
 */
export async function runImport(db: Db, input: ImportInput): Promise<ImportOutcome> {
  const now = input.now ?? new Date();
  const sha256 = sha256Hex(input.buffer);
  const run = await db.importRun.create({
    data: {
      userId: input.actor.userId,
      actorLabel: input.actor.label,
      dryRun: input.dryRun,
      startedAt: now,
      fileName: input.fileName.slice(0, 255),
      fileSize: input.buffer.length,
      fileSha256: sha256,
      createdById: input.actor.userId,
    },
  });
  const fail = async (
    error: string,
    report: ImportReport | null = null,
    blocking = false,
  ): Promise<ImportOutcome> => {
    await finishRun(db, run.id, { status: "FAILED", report, error, blocking });
    return { runId: run.id, ok: false, dryRun: input.dryRun, report, error, blocking };
  };

  const check = checkXlsxFile(input.buffer);
  if (!check.ok) return fail(check.message);

  let parsed;
  try {
    parsed = await readWorkbook(input.buffer);
  } catch {
    return fail("Le classeur est illisible ou endommagé. Exportez-le à nouveau en .xlsx.");
  }
  const base = (dryRun: boolean): ImportReport => ({
    file: { name: run.fileName, size: run.fileSize, sha256 },
    dryRun,
    counts: emptyCounts(),
    personCount: 0,
    issues: [...parsed.blocking, ...parsed.warnings],
  });

  if (parsed.blocking.length > 0) {
    const report = base(input.dryRun);
    if (input.dryRun) {
      await finishRun(db, run.id, { status: "SUCCEEDED", report, error: null, blocking: true });
      return { runId: run.id, ok: true, dryRun: true, report, error: null, blocking: true };
    }
    return fail(
      "Le classeur a des erreurs bloquantes : corrigez-les puis relancez une simulation.",
      report,
      true,
    );
  }

  if (!input.dryRun) {
    const simulations = await db.importRun.findMany({
      where: {
        id: { not: run.id },
        dryRun: true,
        status: "SUCCEEDED",
        startedAt: { gte: new Date(now.getTime() - SIMULATION_VALIDITY_MS), lte: now },
      },
      orderBy: { startedAt: "desc" },
    });
    const simulation = simulations.find((s) => sameActor(s, input.actor));
    if (!simulation)
      return fail(
        "Import refusé : lancez d'abord une simulation de ce fichier (valable 30 minutes).",
      );
    if (simulation.fileSha256 !== sha256) {
      return fail(
        "Import refusé : ce fichier n'est pas celui de la dernière simulation. Relancez une simulation.",
      );
    }
    if (simulation.blocking)
      return fail("Import refusé : la simulation de ce fichier a des erreurs bloquantes.");
  }

  const context = (apply: boolean): ImportContext => ({
    apply,
    now,
    today: toParisDay(now),
    actorUserId: input.actor.userId,
    afterSheet: input.afterSheet,
  });

  try {
    const result = await db.$transaction(
      async (tx) => {
        if (!input.dryRun) {
          const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(${IMPORT_LOCK_KEY}::bigint) AS locked
          `;
          if (!lock?.locked) throw new ImportBusyError();
        }
        const imported = await importWorkbook(tx, parsed, context(!input.dryRun));
        if (!input.dryRun) {
          await tx.auditLog.create({
            data: {
              actorId: input.actor.userId,
              actorLabel: "Import",
              action: "IMPORT",
              entity: "ImportRun",
              entityId: run.id,
              newValue: { file: run.fileName, sha256, totals: { ...totals(imported.counts) } },
            },
          });
        }
        return imported;
      },
      { timeout: 300_000, maxWait: 10_000 },
    );
    for (const warning of parsed.warnings) {
      if (warning.sheet !== "Fichier") result.counts[warning.sheet].warnings += 1;
    }
    const report: ImportReport = {
      ...base(input.dryRun),
      counts: result.counts,
      personCount: result.personCount,
      issues: [...parsed.warnings, ...result.issues],
    };
    await finishRun(db, run.id, { status: "SUCCEEDED", report, error: null, blocking: false });
    return { runId: run.id, ok: true, dryRun: input.dryRun, report, error: null, blocking: false };
  } catch (error) {
    const message =
      error instanceof DomainError
        ? error.message
        : `L'import a échoué, rien n'a été écrit : ${error instanceof Error ? error.message.split("\n").slice(-1)[0] : "erreur inconnue"}`;
    return fail(message);
  }
}

/** Reads a stored report (JSONB) back into its type. */
export function storedReport(value: Prisma.JsonValue): ImportReport | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("file" in value))
    return null;
  return value as unknown as ImportReport;
}

/** Issues of a given level, for display. */
export function issuesOf(report: ImportReport, level: Issue["level"]): Issue[] {
  return report.issues.filter((i) => i.level === level);
}
