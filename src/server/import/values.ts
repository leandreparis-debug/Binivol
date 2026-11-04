import { createHash } from "node:crypto";
import type {
  Aptitude,
  CandidacyStage,
  PersonStatus,
  TrainingResult,
} from "@/generated/prisma/enums";

/**
 * Pure conversions of legacy cell values. Never throw: a value that cannot be
 * read returns `null` with a French warning, so one bad cell never rejects a
 * whole row (except the NIVOL, handled by the caller).
 */

/** A cell, as normalised from exceljs. */
export type Cell = string | number | boolean | Date | null;

export interface Parsed<T> {
  value: T;
  warning?: string;
}

const DAY_MS = 86_400_000;
/** Excel's day 0 in the 1900 date system (with its 1900 leap-year bug). */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Trimmed text with collapsed spaces (NBSP included), or null when empty. */
export function cellText(cell: Cell): string | null {
  if (cell === null) return null;
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? null : cell.toISOString();
  const text = String(cell)
    .replace(/[\s ]+/g, " ")
    .trim();
  return text === "" ? null : text;
}

/** Comparison key: lower case, no accent, collapsed spaces. */
export function valueKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** « OUI » → true, « NON » → false, empty → null (unknown, not false). */
export function parseYesNo(cell: Cell): Parsed<boolean | null> {
  if (typeof cell === "boolean") return { value: cell };
  const text = cellText(cell);
  if (text === null) return { value: null };
  const key = valueKey(text);
  if (key === "oui") return { value: true };
  if (key === "non") return { value: false };
  return {
    value: null,
    warning: `Valeur Oui/Non illisible « ${text} », considérée comme inconnue.`,
  };
}

function utcDay(y: number, m: number, d: number): Date | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date
    : null;
}

/** Excel serial number → calendar day (00:00 UTC). */
export function excelSerialToDay(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null;
  return new Date(EXCEL_EPOCH + Math.floor(serial) * DAY_MS);
}

/**
 * A calendar day, from an Excel date, an Excel serial number or a
 * « JJ/MM/AAAA » text. Returned at 00:00 UTC, like Prisma `@db.Date`.
 * Excel dates carry the wall-clock value in UTC (exceljs), so their UTC
 * components are the Paris calendar day.
 */
export function parseDay(cell: Cell): Parsed<Date | null> {
  if (cell === null) return { value: null };
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime()))
      return { value: null, warning: "Date illisible, laissée vide." };
    return {
      value: new Date(Date.UTC(cell.getUTCFullYear(), cell.getUTCMonth(), cell.getUTCDate())),
    };
  }
  if (typeof cell === "number") {
    const day = excelSerialToDay(cell);
    return day
      ? { value: day }
      : { value: null, warning: `Date illisible « ${cell} », laissée vide.` };
  }
  const text = cellText(cell);
  if (text === null) return { value: null };
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const day = fr
    ? utcDay(Number(fr[3]), Number(fr[2]), Number(fr[1]))
    : iso
      ? utcDay(Number(iso[1]), Number(iso[2]), Number(iso[3]))
      : null;
  return day
    ? { value: day }
    : { value: null, warning: `Date illisible « ${text} », laissée vide.` };
}

/** Offset of Paris (minutes east of UTC) at a given instant. */
function parisOffsetMinutes(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** Converts a Paris wall-clock time to the real instant (DST-aware). */
export function parisWallClock(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const first = guess - parisOffsetMinutes(new Date(guess)) * 60_000;
  return new Date(guess - parisOffsetMinutes(new Date(first)) * 60_000);
}

/** The instant of 00:00 in Paris on a calendar day (00:00 UTC input). */
export function parisMidnight(day: Date): Date {
  return parisWallClock(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate());
}

/**
 * An instant, from an Excel date-time (Paris wall clock stored as UTC), an
 * Excel serial with fraction, or « JJ/MM/AAAA [HH:MM[:SS]] » text.
 */
export function parseInstant(cell: Cell): Parsed<Date | null> {
  if (cell === null) return { value: null };
  if (cell instanceof Date) {
    if (Number.isNaN(cell.getTime())) return { value: null, warning: "Horodatage illisible." };
    return {
      value: parisWallClock(
        cell.getUTCFullYear(),
        cell.getUTCMonth() + 1,
        cell.getUTCDate(),
        cell.getUTCHours(),
        cell.getUTCMinutes(),
        cell.getUTCSeconds(),
      ),
    };
  }
  if (typeof cell === "number") {
    const day = excelSerialToDay(cell);
    if (!day) return { value: null, warning: `Horodatage illisible « ${cell} ».` };
    const seconds = Math.round((cell - Math.floor(cell)) * 86_400);
    return {
      value: parisWallClock(
        day.getUTCFullYear(),
        day.getUTCMonth() + 1,
        day.getUTCDate(),
        Math.floor(seconds / 3600),
        Math.floor((seconds % 3600) / 60),
        seconds % 60,
      ),
    };
  }
  const text = cellText(cell);
  if (text === null) return { value: null };
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (!m || !utcDay(Number(m[3]), Number(m[2]), Number(m[1]))) {
    return { value: null, warning: `Horodatage illisible « ${text} ».` };
  }
  return {
    value: parisWallClock(
      Number(m[3]),
      Number(m[2]),
      Number(m[1]),
      Number(m[4] ?? 0),
      Number(m[5] ?? 0),
      Number(m[6] ?? 0),
    ),
  };
}

/** A whole number, or null with a warning. */
export function parseInteger(cell: Cell): Parsed<number | null> {
  if (cell === null) return { value: null };
  const n = typeof cell === "number" ? cell : Number(cellText(cell)?.replace(",", "."));
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { value: null, warning: `Nombre entier illisible « ${cellText(cell) ?? ""} ».` };
  }
  return { value: n };
}

/** Lower-cased address, or null. */
export function normalizeEmailCell(cell: Cell): string | null {
  return cellText(cell)?.toLowerCase() ?? null;
}

/** Phone kept as written, spaces normalised. */
export function normalizePhone(cell: Cell): string | null {
  return cellText(cell);
}

function mapper<T extends string>(table: Record<string, T>, label: string) {
  const byKey = new Map(Object.entries(table).map(([k, v]) => [valueKey(k), v]));
  return (cell: Cell): Parsed<T | null> => {
    const text = cellText(cell);
    if (text === null) return { value: null };
    const value = byKey.get(valueKey(text));
    return value ? { value } : { value: null, warning: `${label} inconnu « ${text} ».` };
  };
}

export const parseStatus = mapper<PersonStatus>(
  {
    Candidat: "CANDIDATE",
    Actif: "ACTIVE",
    Suspendu: "SUSPENDED",
    Inactif: "INACTIVE",
    "Parti(e)": "LEFT",
  },
  "Statut",
);

export const parseAptitude = mapper<Aptitude>(
  { Apte: "FIT", "Non apte": "UNFIT", "Retiré(e)": "WITHDRAWN", "À vérifier": "TO_CHECK" },
  "Aptitude",
);

export const parseResult = mapper<TrainingResult>(
  {
    Validé: "PASSED",
    "Inscrit(e)": "REGISTERED",
    "À confirmer": "TO_CONFIRM",
    "Non validé": "FAILED",
    Absent: "ABSENT",
  },
  "Résultat",
);

export const parseStage = mapper<Extract<CandidacyStage, "FIRST_CONTACT" | "FILE">>(
  { "Premier contact": "FIRST_CONTACT", "Dossier en cours": "FILE" },
  "Étape",
);

export interface Cancellation {
  at: Date;
  email: string | null;
  reason: string;
}

/**
 * The « Annulée » column: empty (active appointment), or
 * `JJ/MM/AAAA par <email> : <motif>`. Any other text cancels at `importDay`
 * with the whole text as reason, and a warning.
 */
export function parseCancellation(cell: Cell, importDay: Date): Parsed<Cancellation | null> {
  const text = cellText(cell);
  if (text === null) return { value: null };
  const m = /^(\d{1,2}\/\d{1,2}\/\d{4})\s+par\s+(\S+@\S+?)\s*:\s*(.+)$/i.exec(text);
  const day = m ? parseDay(m[1] ?? null).value : null;
  if (m && day) {
    return {
      value: {
        at: parisMidnight(day),
        email: (m[2] ?? "").toLowerCase(),
        reason: (m[3] ?? "").trim(),
      },
    };
  }
  return {
    value: { at: parisMidnight(importDay), email: null, reason: text },
    warning:
      "Annulation au format libre : datée du jour de l'import, texte complet gardé en motif.",
  };
}

/** Legacy field labels whose values are sensitive (journal masking). */
const SENSITIVE_JOURNAL_FIELDS = [
  "date de naissance",
  "date verif. b3",
  "date verif b3",
  "b3",
  "autorisation parentale",
  "date autorisation",
  "adresse",
  "birthdate",
  "b3checkedat",
  "parentalauthorization",
  "parentalauthorizationdate",
];

export const SENSITIVE_MASK = "[sensible]";

/** True when a journal « Champ » holds sensitive data (birth, B3, parental authorisation, address). */
export function isSensitiveJournalField(field: string | null): boolean {
  if (!field) return false;
  const key = valueKey(field);
  return (
    SENSITIVE_JOURNAL_FIELDS.includes(key) || key.includes("adresse") || key.includes("naissance")
  );
}

export interface JournalRow {
  at: string | null;
  user: string | null;
  action: string | null;
  table: string | null;
  key: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
}

/** Masks the values of a sensitive journal row. */
export function maskJournalRow(row: JournalRow): JournalRow {
  if (!isSensitiveJournalField(row.field)) return row;
  return {
    ...row,
    oldValue: row.oldValue === null ? null : SENSITIVE_MASK,
    newValue: row.newValue === null ? null : SENSITIVE_MASK,
  };
}

/**
 * SHA-256 of a normalised, **masked** journal row: a second import of the same
 * row is skipped. Hashing masked values keeps sensitive values out of reach of
 * a dictionary attack on the hash.
 */
export function journalHash(row: JournalRow): string {
  const masked = maskJournalRow(row);
  return createHash("sha256")
    .update(
      JSON.stringify([
        masked.at,
        masked.user,
        masked.action,
        masked.table,
        masked.key,
        masked.field,
        masked.oldValue,
        masked.newValue,
      ]),
    )
    .digest("hex");
}
