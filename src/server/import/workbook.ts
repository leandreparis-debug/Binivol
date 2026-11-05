import ExcelJS from "exceljs";
import { normalizeHeader, SHEET_COLUMNS, type SheetName } from "./columns";
import type { Issue } from "./report";
import type { Cell } from "./values";

export interface SheetRow {
  /** Row number in the workbook (1 = headers). */
  row: number;
  /** Cells by expected column name. */
  cells: Record<string, Cell>;
}

export interface ParsedWorkbook {
  sheets: Partial<Record<SheetName, SheetRow[]>>;
  /** Missing sheets or columns: the import cannot run. */
  blocking: Issue[];
  /** Unknown sheets or columns. */
  warnings: Issue[];
}

/** Converts an exceljs value into a plain cell. */
export function toCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (
    value instanceof Date ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if ("richText" in value) return value.richText.map((r) => r.text).join("");
  if ("hyperlink" in value) return value.text;
  if ("result" in value) {
    const result = value.result;
    if (result === undefined || (typeof result === "object" && !(result instanceof Date)))
      return null;
    return result;
  }
  return null;
}

const isEmptyRow = (cells: Record<string, Cell>) =>
  Object.values(cells).every((c) => c === null || (typeof c === "string" && c.trim() === ""));

/**
 * Reads the workbook in memory. Headers are matched after trimming extra
 * spaces. A missing sheet or expected column is blocking; unknown sheets and
 * columns are warnings. Entirely empty rows are skipped silently.
 */
/** The 8th sheet of the real v03: drop-down lists (statuses, aptitudes, results…). */
export const LISTS_SHEET = "Listes";

export async function readWorkbook(buffer: Buffer): Promise<ParsedWorkbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const result: ParsedWorkbook = { sheets: {}, blocking: [], warnings: [] };
  const known = new Set<string>(Object.keys(SHEET_COLUMNS));

  for (const sheet of workbook.worksheets) {
    if (!known.has(normalizeHeader(sheet.name))) {
      result.warnings.push({
        sheet: "Fichier",
        row: null,
        key: sheet.name,
        level: "warning",
        message:
          normalizeHeader(sheet.name) === LISTS_SHEET
            ? `Onglet « ${sheet.name} » non repris : listes de valeurs de l'ancien classeur, Binivol a les siennes.`
            : `Onglet « ${sheet.name} » non repris.`,
      });
    }
  }

  for (const name of Object.keys(SHEET_COLUMNS) as SheetName[]) {
    const sheet = workbook.worksheets.find((ws) => normalizeHeader(ws.name) === name);
    if (!sheet) {
      result.blocking.push({
        sheet: name,
        row: null,
        key: null,
        level: "blocking",
        message: `Onglet « ${name} » manquant.`,
      });
      continue;
    }
    const headerByColumn = new Map<number, string>();
    sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, col) => {
      const text = typeof cell.value === "string" ? cell.value : String(toCell(cell.value) ?? "");
      const header = normalizeHeader(text);
      if (header !== "") headerByColumn.set(col, header);
    });
    const headers = new Set(headerByColumn.values());
    const expected: readonly string[] = SHEET_COLUMNS[name];
    const missing = expected.filter((h) => !headers.has(h));
    for (const column of missing) {
      result.blocking.push({
        sheet: name,
        row: 1,
        key: column,
        level: "blocking",
        message: `Colonne obligatoire « ${column} » manquante dans l'onglet « ${name} ».`,
      });
    }
    for (const header of headers) {
      if (!expected.includes(header)) {
        result.warnings.push({
          sheet: name,
          row: 1,
          key: header,
          level: "warning",
          message: `Colonne inconnue « ${header} » ignorée.`,
        });
      }
    }
    if (missing.length > 0) continue;

    const rows: SheetRow[] = [];
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return;
      const cells: Record<string, Cell> = {};
      for (const [col, header] of headerByColumn) {
        if (expected.includes(header)) cells[header] = toCell(row.getCell(col).value);
      }
      if (!isEmptyRow(cells)) rows.push({ row: rowNumber, cells });
    });
    result.sheets[name] = rows;
  }
  return result;
}
