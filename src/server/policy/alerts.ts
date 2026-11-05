import type { Perimeter, Profile } from "@/generated/prisma/enums";
import type { PolicyAction } from "@/lib/actions";
import { PROFILE_PERIMETER } from "./matrix";

/**
 * Who sees which alert (step 12). Each alert rule belongs to a **topic**;
 * each topic is governed by one action of the matrix. Screens and e-mails
 * never test a profile: they ask `can()` / `visibleSql()` for this action.
 *
 * - `training`: trainings and appointments (TOPAZE, FORMAT, ACTION, LASER,
 *   FORMAT GP on the people of their perimeter);
 * - `integration`: candidates, follow-ups, pauses, file completeness (TOPAZE,
 *   DIAMANT in scope);
 * - `admin`: B3, purge, NIVOL, reference list problems on a person (TOPAZE);
 * - `reference`: alerts on the reference list itself, not on a person
 *   (`reference.manage`: TOPAZE, FORMAT).
 */
export type AlertTopic = "training" | "integration" | "admin" | "reference";

export const ALERT_TOPIC_ACTION: Record<AlertTopic, PolicyAction> = {
  training: "alert.training.read",
  integration: "alert.integration.read",
  admin: "alert.admin.read",
  reference: "reference.manage",
};

/**
 * A training reminder (« formation qui arrive à échéance ») concerns a
 * recipient profile when the profile follows all trainings (TOPAZE, FORMAT)
 * or the training belongs to the profile's perimeter (ACTION, LASER,
 * FORMAT GP).
 */
export function trainingConcernsProfile(
  profile: Profile,
  referencePerimeters: readonly Perimeter[],
): boolean {
  if (profile === "TOPAZE" || profile === "FORMAT") return true;
  const perimeter = PROFILE_PERIMETER[profile];
  return perimeter !== undefined && referencePerimeters.includes(perimeter);
}
