import { formatDate } from "@/lib/dates";

/**
 * CSV for Excel in French (step 13, docs/exports.md): UTF-8 with BOM, `;`
 * separator, CRLF, dates JJ/MM/AAAA. Quotes, separators and line breaks are
 * escaped; a cell starting with `=`, `+`, `-`, `@` (or a tab / carriage
 * return) is prefixed with an apostrophe so that it is never run as a
 * formula (CSV injection).
 */

export const CSV_BOM = "﻿";
export const CSV_SEPARATOR = ";";

export type CsvValue = string | number | boolean | Date | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

/** One cell, escaped. */
export function csvCell(value: CsvValue): string {
  let text: string;
  if (value === null || value === undefined) text = "";
  else if (value instanceof Date) text = formatDate(value);
  else if (typeof value === "boolean") text = value ? "Oui" : "Non";
  else text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[";\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** The whole file, BOM included. */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(CSV_SEPARATOR),
    ...rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(CSV_SEPARATOR)),
  ];
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

/** `binivol-prefecture-2026-11-06.csv` (dated file name, ASCII only). */
export function csvFileName(kind: string, day: Date): string {
  return `binivol-${kind}-${day.toISOString().slice(0, 10)}.csv`;
}
