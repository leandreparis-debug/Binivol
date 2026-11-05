import type { PersonStatus } from "@/generated/prisma/enums";

/**
 * Checks that **warn without blocking** (step 10, philosophy of the legacy
 * tool: never block the field). Pure and reusable. Only real errors block
 * (required field, format, end before start, a minor and a function
 * forbidden to minors): they are thrown by the services, not listed here.
 *
 * Each warning is shown before saving; « Enregistrer quand même » saves and
 * writes the list of accepted warnings in the audit.
 */

export type WarningCode =
  | "FUTURE_DATE"
  | "MISSING_PREREQUISITE"
  | "DUPLICATE_SESSION"
  | "NO_AUTHORIZER"
  | "NOT_PRESENT"
  | "SESSION_FULL";

export interface Warning {
  code: WarningCode;
  message: string;
  /** The person concerned, for a group entry. */
  personId?: string;
}

const PRESENT: readonly PersonStatus[] = ["ACTIVE", "PAUSED"];

const day = (d: Date) => d.toISOString().slice(0, 10);
const fr = (d: Date) => `${day(d).slice(8, 10)}/${day(d).slice(5, 7)}/${day(d).slice(0, 4)}`;

export interface TrainingCandidate {
  id: string;
  name: string;
  status: PersonStatus;
  /** Codes of the competences valid on the training date (prerequisites). */
  validCodes: ReadonlySet<string>;
  /** Dates (AAAA-MM-JJ) of her live lines for this training. */
  sameTrainingDates: readonly string[];
}

export interface TrainingEntry {
  reference: {
    code: string;
    label: string;
    prerequisites: readonly { code: string; label: string }[];
  };
  /** Training date; null when unknown. */
  date: Date | null;
  result: "REGISTERED" | "PASSED" | "FAILED" | "ABSENT" | "TO_CONFIRM";
  today: Date;
  /** The session, when the entry is a registration to one. */
  session?: { capacity: number | null; registered: number } | null;
}

/** Warnings of a training entry, computed for the whole group at once. */
export function trainingWarnings(
  entry: TrainingEntry,
  people: readonly TrainingCandidate[],
): Warning[] {
  const out: Warning[] = [];
  if (entry.date && entry.result === "PASSED" && entry.date.getTime() > entry.today.getTime()) {
    out.push({
      code: "FUTURE_DATE",
      message: `La date de réussite (${fr(entry.date)}) est dans le futur.`,
    });
  }
  const capacity = entry.session?.capacity ?? null;
  if (entry.session && capacity !== null) {
    const total = entry.session.registered + people.length;
    if (total > capacity) {
      out.push({
        code: "SESSION_FULL",
        message: `La session est complète : ${String(total)} inscrits pour ${String(capacity)} places.`,
      });
    }
  }
  for (const p of people) {
    if (!PRESENT.includes(p.status)) {
      out.push({
        code: "NOT_PRESENT",
        personId: p.id,
        message: `${p.name} n'est pas présent(e) (statut : ${statusLabel(p.status)}).`,
      });
    }
    const missing = entry.reference.prerequisites.filter((pre) => !p.validCodes.has(pre.code));
    if (missing.length > 0) {
      out.push({
        code: "MISSING_PREREQUISITE",
        personId: p.id,
        message: `${p.name} n'a pas de ${missing.map((m) => m.code).join(", ")} valide à cette date (prérequis de ${entry.reference.code}).`,
      });
    }
    if (entry.date && p.sameTrainingDates.includes(day(entry.date))) {
      out.push({
        code: "DUPLICATE_SESSION",
        personId: p.id,
        message: `${p.name} a déjà une ligne ${entry.reference.code} le ${fr(entry.date)}.`,
      });
    }
  }
  return out;
}

/** Warnings of an appointment (the minor/forbidden check blocks, elsewhere). */
export function appointmentWarnings(input: {
  name: string;
  status: PersonStatus;
  authorizedBy: string | null;
}): Warning[] {
  const out: Warning[] = [];
  if (!input.authorizedBy?.trim()) {
    out.push({ code: "NO_AUTHORIZER", message: "La nomination n'indique pas qui l'a autorisée." });
  }
  if (!PRESENT.includes(input.status)) {
    out.push({
      code: "NOT_PRESENT",
      message: `${input.name} n'est pas présent(e) (statut : ${statusLabel(input.status)}).`,
    });
  }
  return out;
}

function statusLabel(status: PersonStatus): string {
  const labels: Record<PersonStatus, string> = {
    CANDIDATE: "candidat",
    ACTIVE: "actif",
    PAUSED: "en pause",
    SUSPENDED: "suspendu",
    INACTIVE: "inactif",
    LEFT: "parti",
  };
  return labels[status];
}

/** A stable key of the warnings (the client sends it back with « Enregistrer quand même »). */
export function warningsKey(warnings: readonly Warning[]): string {
  return warnings
    .map((w) => `${w.code}:${w.personId ?? ""}`)
    .sort()
    .join("|");
}
