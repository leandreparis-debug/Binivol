import type { Profile } from "@/generated/prisma/enums";
import type { PolicyAction } from "@/lib/actions";
import { POLICY_ACTION_LABELS } from "@/lib/labels";
import {
  CONDITION_LABELS,
  CONDITION_ORDER,
  MATRIX,
  PROFILE_PERIMETER,
  type ActionRule,
  type Condition,
} from "./matrix";
import type { Actor, PersonFacts, PolicyDecision, PolicyResource } from "./types";

/**
 * True when the person « relève » of the profile:
 * - never when archived;
 * - DIAMANT: the person is in the DIAMANT scope (candidates included);
 * - ACTION, LASER, FORMAT_GP: the person is not a candidate and her perimeters
 *   contain the profile's perimeter;
 * - TOPAZE and FORMAT: nobody relève of them (they have global rights instead).
 */
export function relevesOf(person: PersonFacts, profile: Profile): boolean {
  if (person.archived) return false;
  if (profile === "DIAMANT") return person.inDiamantScope;
  const perimeter = PROFILE_PERIMETER[profile];
  if (!perimeter) return false;
  return person.status !== "CANDIDATE" && person.perimeters.has(perimeter);
}

/** Profiles of whom the person relève (for display). */
export function profilesInCharge(person: PersonFacts): Profile[] {
  return (["ACTION", "LASER", "FORMAT_GP", "DIAMANT"] as const).filter((p) => relevesOf(person, p));
}

/**
 * « À faire » (step 16): the actor takes part in the task (author, active
 * assignee, active member of its project) or, for a project, is an active
 * member. Without task nor project: her own list, always.
 */
export function isTodoParticipant(userId: string | undefined, resource?: PolicyResource): boolean {
  if (!userId) return false;
  const todo = resource?.todo;
  if (todo) {
    return (
      todo.ownerId === userId ||
      todo.assigneeIds.includes(userId) ||
      todo.projectMemberIds.includes(userId)
    );
  }
  if (resource?.project) return resource.project.memberIds.includes(userId);
  return true;
}

/** The actor may edit, reassign or archive the task: its author, or an OWNER of its project. */
export function isTodoManager(userId: string | undefined, resource?: PolicyResource): boolean {
  const todo = resource?.todo;
  if (!userId || !todo) return false;
  return todo.ownerId === userId || todo.projectOwnerIds.includes(userId);
}

function conditionHolds(
  condition: Condition,
  profile: Profile,
  resource: PolicyResource | undefined,
  userId: string | undefined,
): boolean {
  const person = resource?.person;
  switch (condition) {
    case "always":
      return true;
    case "notArchived":
      return person !== undefined && !person.archived;
    case "notArchivedNotCandidate":
      return person !== undefined && !person.archived && person.status !== "CANDIDATE";
    case "inScope":
      return person !== undefined && relevesOf(person, profile);
    case "managedFunctionInScope":
      return (
        person !== undefined &&
        resource?.function !== undefined &&
        resource.function.managedBy.includes(profile) &&
        relevesOf(person, profile)
      );
    case "todoParticipant":
      return isTodoParticipant(userId, resource);
    case "todoManager":
      return isTodoManager(userId, resource);
    case "projectOwner":
      return userId !== undefined && (resource?.project?.ownerIds.includes(userId) ?? false);
  }
}

function missingResource(rule: ActionRule, resource: PolicyResource | undefined): string | null {
  if (rule.target === "none") return null;
  // A task rule without a task applies to one's own list; `todoManager` checks the task itself.
  if (rule.target === "todo") return null;
  if (rule.target === "todoProject") return resource?.project ? null : "Projet non précisé.";
  if (!resource?.person) return "Personne non précisée.";
  if (rule.target === "personAndFunction" && !resource.function) return "Fonction non précisée.";
  return null;
}

/**
 * The access policy. **Pure**: it never reads the database, every fact it
 * needs is passed in. Profiles add up: the actor is allowed as soon as one
 * of her profiles is. The « À faire » rules also need the actor's `userId`.
 *
 * @example can(actor, "person.sensitive.read", { person: facts })
 */
export function can(
  actor: Pick<Actor, "profiles"> & { userId?: string },
  action: PolicyAction,
  resource?: PolicyResource,
): PolicyDecision {
  const rule: ActionRule = MATRIX[action];
  const label = POLICY_ACTION_LABELS[action];
  const missing = missingResource(rule, resource);
  if (missing) return { allowed: false, reason: `${label} : ${missing}` };

  for (const grant of rule.grants) {
    for (const profile of grant.profiles) {
      if (
        actor.profiles.has(profile) &&
        conditionHolds(grant.when, profile, resource, actor.userId)
      ) {
        return { allowed: true, reason: `${label} : autorisé par le profil ${profile}.` };
      }
    }
  }
  if (resource?.person?.archived && !actor.profiles.has("TOPAZE")) {
    return { allowed: false, reason: `${label} : personne archivée, réservé à TOPAZE.` };
  }
  return { allowed: false, reason: `${label} : aucun de vos profils ne le permet.` };
}

/**
 * True when at least one profile of the actor holds the action for *some*
 * resource (whatever the condition). Used for menus, page entry and `/moi`;
 * the final check on a given person is always `can()`.
 */
export function canSome(actor: Pick<Actor, "profiles">, action: PolicyAction): boolean {
  return MATRIX[action].grants.some((grant) => grant.profiles.some((p) => actor.profiles.has(p)));
}

/** The most permissive condition under which a profile holds an action, or null. */
export function conditionFor(action: PolicyAction, profile: Profile): Condition | null {
  const conditions = MATRIX[action].grants
    .filter((grant) => grant.profiles.includes(profile))
    .map((grant) => grant.when);
  return CONDITION_ORDER.find((c) => conditions.includes(c)) ?? null;
}

/** French wording of `conditionFor`, « — » when the profile never holds the action. */
export function describeGrant(action: PolicyAction, profile: Profile): string {
  const condition = conditionFor(action, profile);
  return condition ? CONDITION_LABELS[condition] : "—";
}

/**
 * How much of the person page the actor may open:
 * - `full`: `person.full.read` (every tab the other rights allow);
 * - `trainings`: `training.read` without `person.full.read` (FORMAT): a header
 *   reduced to the directory fields and the Formations tab only;
 * - `null`: no person page (403, or 404 when the directory hides the person).
 */
export type PersonPageAccess = "full" | "trainings" | null;

export function personPageAccess(
  actor: Pick<Actor, "profiles">,
  person: PersonFacts,
): PersonPageAccess {
  if (can(actor, "person.full.read", { person }).allowed) return "full";
  if (can(actor, "training.read", { person }).allowed) return "trainings";
  return null;
}

/** Raised by `authorize` when the policy refuses. Pages turn it into a 403. */
export class ForbiddenError extends Error {
  readonly action: PolicyAction;

  constructor(action: PolicyAction, reason: string) {
    super(reason);
    this.name = "ForbiddenError";
    this.action = action;
  }
}

/** Like `can()`, but throws a `ForbiddenError` on refusal. */
export function authorize(
  actor: Pick<Actor, "profiles"> & { userId?: string },
  action: PolicyAction,
  resource?: PolicyResource,
): void {
  const decision = can(actor, action, resource);
  if (!decision.allowed) throw new ForbiddenError(action, decision.reason);
}
