import { randomBytes } from "node:crypto";
import type { CandidacyStage, PersonStatus } from "@/generated/prisma/enums";
import { addMonthsUtc } from "./reference";

/**
 * GDPR purge, pure rules (step 14, docs/rgpd.md).
 * - `RETENTION`: a person who left, whose `purgeEligibleAt` (departure +
 *   RETENTION_YEARS_AFTER_LEAVE) is reached;
 * - `ABANDONED`: a candidate who never became a volunteer (no entry date, no
 *   NIVOL), all of whose candidacies are abandoned, the last one closed more
 *   than ABANDONED_RETENTION_MONTHS ago.
 */

export type PurgeRule = "RETENTION" | "ABANDONED" | "EARLY";

export const PURGE_RULE_LABELS: Record<PurgeRule, string> = {
  RETENTION: "Durée de conservation après le départ échue",
  ABANDONED: "Candidature abandonnée, conservation échue",
  EARLY: "Effacement anticipé décidé par TOPAZE",
};

export interface PurgeFacts {
  status: PersonStatus;
  purgeEligibleAt: Date | null;
  entryDate: Date | null;
  nivol: string | null;
  candidacies: readonly { stage: CandidacyStage; closedAt: Date | null }[];
}

export function purgeRuleOf(
  person: PurgeFacts,
  day: Date,
  abandonedRetentionMonths: number,
): Exclude<PurgeRule, "EARLY"> | null {
  if (person.status === "LEFT") {
    return person.purgeEligibleAt && person.purgeEligibleAt.getTime() <= day.getTime()
      ? "RETENTION"
      : null;
  }
  if (person.status !== "CANDIDATE" || person.entryDate !== null || person.nivol !== null) {
    return null;
  }
  if (person.candidacies.length === 0) return null;
  if (!person.candidacies.every((c) => c.stage === "ABANDONED" && c.closedAt !== null)) return null;
  const last = Math.max(...person.candidacies.map((c) => c.closedAt?.getTime() ?? 0));
  const limit = addMonthsUtc(day, -abandonedRetentionMonths);
  return last <= limit.getTime() ? "ABANDONED" : null;
}

/** A pseudonym replacing a purged identifier in the logs: random, never derived from it. */
export function pseudonym(): string {
  return `purge_${randomBytes(9).toString("hex")}`;
}
