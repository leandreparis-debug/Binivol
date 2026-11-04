import { IMPORT_ORDER, type SheetName } from "./columns";

export type IssueLevel = "blocking" | "rejected" | "conflict" | "warning";

export interface Issue {
  sheet: SheetName | "Fichier";
  /** Row number in the workbook, or null for file-level issues. */
  row: number | null;
  /** Business key of the row (NIVOL, legacy ID, code…). */
  key: string | null;
  level: IssueLevel;
  message: string;
}

export interface SheetCounts {
  created: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  rejected: number;
  warnings: number;
}

export interface ImportReport {
  file: { name: string; size: number; sha256: string };
  dryRun: boolean;
  counts: Record<SheetName, SheetCounts>;
  /** Persons created or updated (confirmation message). */
  personCount: number;
  issues: Issue[];
}

export const LEVEL_LABELS: Record<IssueLevel, string> = {
  blocking: "Erreur bloquante",
  rejected: "Rejet",
  conflict: "Ignorée pour conflit",
  warning: "Avertissement",
};

export const SHEET_LABELS: Record<SheetName, string> = {
  Referentiel: "Référentiel",
  Parametres: "Paramètres",
  Benevoles: "Bénévoles",
  Prospects: "Prospects",
  Sessions: "Sessions",
  Fonctions: "Fonctions",
  Journal: "Journal",
};

export function emptyCounts(): Record<SheetName, SheetCounts> {
  return Object.fromEntries(
    IMPORT_ORDER.map((s) => [
      s,
      { created: 0, updated: 0, unchanged: 0, conflicts: 0, rejected: 0, warnings: 0 },
    ]),
  ) as Record<SheetName, SheetCounts>;
}

/** Totals over every sheet. */
export function totals(counts: Record<SheetName, SheetCounts>): SheetCounts {
  return Object.values(counts).reduce(
    (acc, c) => ({
      created: acc.created + c.created,
      updated: acc.updated + c.updated,
      unchanged: acc.unchanged + c.unchanged,
      conflicts: acc.conflicts + c.conflicts,
      rejected: acc.rejected + c.rejected,
      warnings: acc.warnings + c.warnings,
    }),
    { created: 0, updated: 0, unchanged: 0, conflicts: 0, rejected: 0, warnings: 0 },
  );
}

const csvCell = (value: string | number | null) => {
  const text = value === null ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/**
 * CSV of a report (semicolons and BOM, for French spreadsheets): counts per
 * sheet, then every issue with sheet, row, key, level and message.
 */
export function reportToCsv(report: ImportReport, meta: { date: string; author: string }): string {
  const lines: (string | number | null)[][] = [
    ["Rapport d'import Binivol"],
    ["Fichier", report.file.name],
    ["Empreinte SHA-256", report.file.sha256],
    ["Date", meta.date],
    ["Auteur", meta.author],
    ["Type", report.dryRun ? "Simulation" : "Import réel"],
    [],
    [
      "Onglet",
      "Créées",
      "Mises à jour",
      "Inchangées",
      "Ignorées pour conflit",
      "Rejetées",
      "Avertissements",
    ],
    ...IMPORT_ORDER.map((s) => {
      const c = report.counts[s];
      return [
        SHEET_LABELS[s],
        c.created,
        c.updated,
        c.unchanged,
        c.conflicts,
        c.rejected,
        c.warnings,
      ];
    }),
    [],
    ["Onglet", "Ligne", "Clé", "Niveau", "Motif"],
    ...report.issues.map((i) => [
      i.sheet === "Fichier" ? "Fichier" : SHEET_LABELS[i.sheet],
      i.row,
      i.key,
      LEVEL_LABELS[i.level],
      i.message,
    ]),
  ];
  return `﻿${lines.map((l) => l.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
