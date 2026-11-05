import type { TrainingResult } from "@/generated/prisma/enums";
import { classifyDeadline } from "@/lib/deadlines";

/**
 * **One state per person and reference item** (step 10), as in the legacy
 * tool. Pure: the person page, the « Trouver » search and the matrix
 * (step 13) all read it from here.
 *
 * Trainings:
 * - cancelled lines are ignored;
 * - the **most recent PASSED** line counts (dated before undated);
 * - `VALID` (dated, not expired), `EXPIRING` (within the alert delay),
 *   `VALID_UNDATED` (passed, obtention date unknown), `EXPIRED`;
 * - without a valid pass: `REGISTERED` (a future session), then
 *   `TO_CONFIRM`, then `EXPIRED`, then `NONE`;
 * - a `REGISTERED` line whose session is past is a « résultat à reporter ».
 *
 * Functions: `FUNCTION_ACTIVE` (an appointment covering the day),
 * `FUNCTION_ENDED` (only finished ones), `NONE`.
 */

export type QualificationStatus =
  | "VALID"
  | "VALID_UNDATED"
  | "EXPIRING"
  | "EXPIRED"
  | "REGISTERED"
  | "TO_CONFIRM"
  | "FUNCTION_ACTIVE"
  | "FUNCTION_ENDED"
  | "NONE";

export const QUALIFICATION_LABELS: Record<QualificationStatus, string> = {
  VALID: "Valide",
  VALID_UNDATED: "Valide (date inconnue)",
  EXPIRING: "Expire bientôt",
  EXPIRED: "Expirée",
  REGISTERED: "Inscrit(e)",
  TO_CONFIRM: "À confirmer",
  FUNCTION_ACTIVE: "Fonction en cours",
  FUNCTION_ENDED: "Fonction terminée",
  NONE: "Aucune",
};

/** States that count as « holds this competence » (Trouver, prerequisites). */
export const VALID_STATES: readonly QualificationStatus[] = [
  "VALID",
  "VALID_UNDATED",
  "EXPIRING",
  "FUNCTION_ACTIVE",
];

export interface RecordFact {
  result: TrainingResult;
  /** Obtention date (or session date for a registration). */
  date: Date | null;
  expiresAt: Date | null;
  cancelledAt: Date | null;
  /** Start of the linked session, if any. */
  sessionStart?: Date | null;
}

export interface AppointmentFact {
  startDate: Date | null;
  endDate: Date | null;
  cancelledAt: Date | null;
}

export interface TrainingState {
  status: QualificationStatus;
  /** Obtention date of the pass that counts. */
  obtainedAt: Date | null;
  /** Its expiry (last valid day), or null. */
  expiresAt: Date | null;
  /** A registration to a past session still waits for its result. */
  pendingResult: boolean;
}

const time = (d: Date | null | undefined) => (d ? d.getTime() : Number.NEGATIVE_INFINITY);

export function trainingState(
  records: readonly RecordFact[],
  day: Date,
  alertDays: number,
): TrainingState {
  const live = records.filter((r) => r.cancelledAt === null);
  const registrations = live.filter((r) => r.result === "REGISTERED");
  const when = (r: RecordFact) => r.sessionStart ?? r.date;
  const pendingResult = registrations.some((r) => {
    const at = when(r);
    return at !== null && at !== undefined && at.getTime() < day.getTime();
  });
  const futureRegistration = registrations.some((r) => {
    const at = when(r);
    return at === null || at === undefined || at.getTime() >= day.getTime();
  });

  const passed = live
    .filter((r) => r.result === "PASSED")
    .sort((a, b) => time(b.date) - time(a.date));
  const best = passed[0];
  if (best) {
    if (best.date === null) {
      return {
        status: "VALID_UNDATED",
        obtainedAt: null,
        expiresAt: best.expiresAt,
        pendingResult,
      };
    }
    const deadline = classifyDeadline(best.expiresAt, day, alertDays);
    if (deadline !== "expired") {
      return {
        status: deadline === "soon" ? "EXPIRING" : "VALID",
        obtainedAt: best.date,
        expiresAt: best.expiresAt,
        pendingResult,
      };
    }
  }
  const base = {
    obtainedAt: best?.date ?? null,
    expiresAt: best?.expiresAt ?? null,
    pendingResult,
  };
  if (futureRegistration || pendingResult) return { status: "REGISTERED", ...base };
  if (live.some((r) => r.result === "TO_CONFIRM")) return { status: "TO_CONFIRM", ...base };
  if (best) return { status: "EXPIRED", ...base };
  return { status: "NONE", ...base };
}

export function functionState(
  appointments: readonly AppointmentFact[],
  day: Date,
): { status: QualificationStatus; since: Date | null } {
  const live = appointments.filter((a) => a.cancelledAt === null);
  const active = live
    .filter(
      (a) =>
        (a.startDate === null || a.startDate.getTime() <= day.getTime()) &&
        (a.endDate === null || a.endDate.getTime() >= day.getTime()),
    )
    .sort((a, b) => time(b.startDate) - time(a.startDate));
  if (active[0]) return { status: "FUNCTION_ACTIVE", since: active[0].startDate };
  if (live.some((a) => a.endDate !== null && a.endDate.getTime() < day.getTime())) {
    return { status: "FUNCTION_ENDED", since: null };
  }
  return { status: "NONE", since: null };
}

export function isValidState(status: QualificationStatus): boolean {
  return VALID_STATES.includes(status);
}
