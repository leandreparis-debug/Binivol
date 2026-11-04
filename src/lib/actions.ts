/**
 * Closed list of the actions checked by the access policy
 * (`src/server/policy`). Client-safe: navigation and `/moi` use it.
 * French labels live in `src/lib/labels.ts` (`POLICY_ACTION_LABELS`).
 */
export const POLICY_ACTIONS = [
  "person.directory.read",
  "person.full.read",
  "person.sensitive.read",
  "person.update",
  "person.status.change",
  "training.read",
  "training.write",
  "trainingSession.manage",
  "trainingWish.manage",
  "appointment.read",
  "appointment.write",
  "candidacy.manage",
  "dossier.manage",
  "mentorship.manage",
  "followUp.manage",
  "document.read",
  "document.upload",
  "user.manage",
  "reference.manage",
  "setting.manage",
  "reminderRule.manage",
  "audit.read",
  "accessLog.read",
  "person.export",
  "import.run",
  "notification.readOwn",
] as const;

export type PolicyAction = (typeof POLICY_ACTIONS)[number];

export function isPolicyAction(value: string): value is PolicyAction {
  return (POLICY_ACTIONS as readonly string[]).includes(value);
}
