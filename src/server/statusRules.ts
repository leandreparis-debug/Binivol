import type { PersonStatus } from "@/generated/prisma/enums";

/**
 * Pure rules of step 11: changes of status (pause, resume, departure,
 * return of a former volunteer), dates of the follow-ups, mentorship. Tested
 * like the candidacy state machine; the services refuse what they refuse.
 */

export type StatusKind = "pause" | "resume" | "leave" | "return" | "other";

export type StatusDecision =
  | {
      allowed: true;
      kind: StatusKind;
      /** Fields the change needs. */
      requires: ("leftAt" | "leftReason" | "pausedAt" | "reason")[];
    }
  | { allowed: false; reason: string };

/**
 * A candidate changes status by her integration only; a change to the same
 * status is refused. Everything else is allowed, with its requirements:
 * - → LEFT: date and reason of departure;
 * - → PAUSED: start of the pause (the planned return and reason are optional);
 * - LEFT → ACTIVE: « retour d'un ancien », a reason.
 */
export function decideStatusChange(from: PersonStatus, to: PersonStatus): StatusDecision {
  if (from === "CANDIDATE") {
    return { allowed: false, reason: "Un candidat change de statut par son intégration." };
  }
  if (to === "CANDIDATE") {
    return { allowed: false, reason: "On ne redevient pas candidat par un changement de statut." };
  }
  if (from === to) return { allowed: false, reason: "C'est déjà son statut." };
  if (to === "LEFT") return { allowed: true, kind: "leave", requires: ["leftAt", "leftReason"] };
  if (to === "PAUSED") return { allowed: true, kind: "pause", requires: ["pausedAt"] };
  if (from === "LEFT" && to === "ACTIVE")
    return { allowed: true, kind: "return", requires: ["reason"] };
  if (from === "PAUSED" && to === "ACTIVE") return { allowed: true, kind: "resume", requires: [] };
  return { allowed: true, kind: "other", requires: [] };
}

/** Adds whole years to a calendar day (29/02 → 28/02 on a non-leap year). */
export function addYears(day: Date, years: number): Date {
  const year = day.getUTCFullYear() + years;
  const last = new Date(Date.UTC(year, day.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, day.getUTCMonth(), Math.min(day.getUTCDate(), last)));
}

/**
 * Next annual follow-up: the first anniversary of the entry date strictly
 * after `after`; without an entry date, `after` + 1 year.
 */
export function nextAnniversary(entryDate: Date | null, after: Date): Date {
  if (!entryDate) return addYears(after, 1);
  let years = after.getUTCFullYear() - entryDate.getUTCFullYear();
  let candidate = addYears(entryDate, years);
  while (candidate.getTime() <= after.getTime()) {
    years += 1;
    candidate = addYears(entryDate, years);
  }
  return candidate;
}

/** Day after which data may be purged: departure + retention years (setting, 5 by default). */
export function purgeEligibleAt(leftAt: Date, retentionYears: number): Date {
  return addYears(leftAt, retentionYears);
}

export type FollowUpBucket = "overdue" | "week" | "month" | "later";

/** Where a planned follow-up sits on the board (Paris calendar days). */
export function followUpBucket(scheduledAt: Date, day: Date): FollowUpBucket {
  const diff = Math.round((scheduledAt.getTime() - day.getTime()) / 86_400_000);
  if (diff < 0) return "overdue";
  if (diff <= 7) return "week";
  if (diff <= 31) return "month";
  return "later";
}

/** End of a mentorship is suggested (never imposed) after N months (NEW_VOLUNTEER_MONTHS). */
export function mentorshipEndSuggested(startDate: Date, months: number, day: Date): boolean {
  const limit = new Date(
    Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + months, startDate.getUTCDate()),
  );
  return day.getTime() >= limit.getTime();
}

/** A mentor is present (ACTIVE or PAUSED) and is not the mentee. */
export function mentorProblem(
  mentee: { id: string },
  mentor: { id: string; status: PersonStatus },
): string | null {
  if (mentee.id === mentor.id) return "Un parrain ne peut pas être son propre filleul.";
  if (mentor.status !== "ACTIVE" && mentor.status !== "PAUSED") {
    return "Le parrain doit être un bénévole présent.";
  }
  return null;
}

/** One B3 check per civil year: is one still due in `day`'s year? */
export function b3Due(checkedAt: Date | null, day: Date): boolean {
  return checkedAt === null || checkedAt.getUTCFullYear() < day.getUTCFullYear();
}
