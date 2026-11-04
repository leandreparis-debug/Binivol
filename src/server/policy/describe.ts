import type { Profile } from "@/generated/prisma/enums";
import { POLICY_ACTIONS, type PolicyAction } from "@/lib/actions";
import { POLICY_ACTION_LABELS } from "@/lib/labels";
import { canSome, conditionFor } from "./can";
import { CONDITION_LABELS, CONDITION_ORDER, type Condition } from "./matrix";
import type { Actor } from "./types";

export interface AllowedAction {
  action: PolicyAction;
  label: string;
  /** French wording of the widest condition over the actor's profiles. */
  condition: string;
}

/** What the actor may do, generated from the policy (page /moi). */
export function allowedActions(actor: Pick<Actor, "profiles">): AllowedAction[] {
  return POLICY_ACTIONS.filter((action) => canSome(actor, action)).map((action) => {
    const conditions = [...actor.profiles]
      .map((profile: Profile) => conditionFor(action, profile))
      .filter((c): c is Condition => c !== null);
    const best = CONDITION_ORDER.find((c) => conditions.includes(c)) ?? "always";
    return { action, label: POLICY_ACTION_LABELS[action], condition: CONDITION_LABELS[best] };
  });
}
