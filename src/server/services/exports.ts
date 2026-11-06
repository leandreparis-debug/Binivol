import type { ReferenceCategory } from "@/generated/prisma/enums";
import { csvFileName, toCsv } from "@/lib/csv";
import { toParisDay } from "@/lib/dates";
import { PERSON_STATUS_LABELS } from "@/lib/labels";
import { loadAlertPeople, loadAlertReferences } from "../alerts/load";
import { statesOf } from "../alerts/rules";
import { automationSettings } from "../automationSettings";
import type { DbOrTx } from "../db";
import { authorize } from "../policy/can";
import type { Actor } from "../policy/types";
import { visibleSql } from "../policy/visibility";
import { isValidState } from "../qualification";
import { numericSettings } from "../settings";
import { listDirectory, type DirectoryQuery } from "./directory";
import { matrixView } from "./matrix";

/**
 * Exports (step 13, docs/exports.md): CSV for Excel in French, dated file
 * name, reserved by the policy, and **written to the access log** (who, when,
 * how many lines) before the file leaves.
 */

export interface CsvExport {
  fileName: string;
  csv: string;
  rows: number;
}

async function logExport(db: DbOrTx, actor: Actor, kind: string, rows: number): Promise<void> {
  await db.accessLog.create({
    data: {
      userId: actor.userId,
      scope: "EXPORT",
      context: `export:${kind}:${String(rows)} lignes`,
    },
  });
}

/**
 * Export préfecture (annual obligation): active volunteers with a valid
 * training among `PREFECTURE_CODES` (PSE, FPSE by default), one line per
 * training. To be checked in Pegass before sending.
 */
export async function prefectureExport(
  db: DbOrTx,
  actor: Actor,
  day: Date = toParisDay(),
): Promise<CsvExport> {
  authorize(actor, "person.export");
  const [{ prefectureCodes }, { alertDays, newVolunteerMonths }] = await Promise.all([
    automationSettings(db),
    numericSettings(db),
  ]);
  const ids = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM persons p
    WHERE ${visibleSql(actor, "person.full.read", { day, newVolunteerMonths })}
      AND p.archived_at IS NULL AND p.status = 'ACTIVE'::"PersonStatus"`;
  const references = await loadAlertReferences(db);
  const { people } = await loadAlertPeople(
    db,
    ids.map((r) => r.id),
    day,
  );
  const rows = people
    .flatMap((p) =>
      [...statesOf(p, day, alertDays)].flatMap(([referenceId, state]) => {
        const code = references.get(referenceId)?.code;
        return code && prefectureCodes.includes(code) && isValidState(state.status)
          ? [{ p, code, label: references.get(referenceId)?.label ?? code, state }]
          : [];
      }),
    )
    .sort(
      (a, b) =>
        a.p.lastName.localeCompare(b.p.lastName, "fr") ||
        a.p.firstName.localeCompare(b.p.firstName, "fr") ||
        a.code.localeCompare(b.code),
    );
  const csv = toCsv(rows, [
    { header: "Nom", value: (r) => r.p.lastName },
    { header: "Prénom", value: (r) => r.p.firstName },
    { header: "NIVOL", value: (r) => r.p.nivol },
    { header: "Formation", value: (r) => `${r.code} : ${r.label}` },
    { header: "Date d'obtention", value: (r) => r.state.obtainedAt },
    { header: "Échéance", value: (r) => r.state.expiresAt },
  ]);
  await logExport(db, actor, "prefecture", rows.length);
  return { fileName: csvFileName("prefecture", day), csv, rows: rows.length };
}

/** The directory as filtered on screen, non-sensitive columns only. */
export async function directoryExport(
  db: DbOrTx,
  actor: Actor,
  query: DirectoryQuery,
  day: Date = toParisDay(),
): Promise<CsvExport> {
  authorize(actor, "person.export");
  const page = await listDirectory(db, actor, { ...query, apres: null }, { day, pageSize: 5000 });
  const csv = toCsv(page.rows, [
    { header: "Référence", value: (r) => r.ref },
    { header: "Nom", value: (r) => r.lastName },
    { header: "Prénom", value: (r) => r.firstName },
    { header: "NIVOL", value: (r) => r.nivol },
    { header: "Statut", value: (r) => PERSON_STATUS_LABELS[r.status] },
    { header: "E-mail", value: (r) => r.email },
    { header: "Téléphone", value: (r) => r.phone },
    {
      header: "Compétences",
      value: (r) => r.training?.qualifications.join(", ") ?? "",
    },
  ]);
  await logExport(db, actor, "annuaire", page.rows.length);
  return { fileName: csvFileName("annuaire", day), csv, rows: page.rows.length };
}

/** The matrix as filtered on screen; the symbols are spelled out. */
export async function matrixExport(
  db: DbOrTx,
  actor: Actor,
  category: ReferenceCategory | null,
  day: Date = toParisDay(),
): Promise<CsvExport> {
  authorize(actor, "training.matrix.export");
  const view = await matrixView(db, actor, { category }, day);
  const csv = toCsv(view.rows, [
    { header: "Référence", value: (r) => r.ref },
    { header: "Nom", value: (r) => r.name },
    ...view.columns.map((c, i) => ({
      header: c.code,
      value: (r: (typeof view.rows)[number]) => r.cells[i]?.symbol ?? "",
    })),
  ]);
  await logExport(db, actor, "matrice", view.rows.length);
  return { fileName: csvFileName("matrice", day), csv, rows: view.rows.length };
}
