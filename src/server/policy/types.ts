import type { Perimeter, PersonStatus, Profile } from "@/generated/prisma/enums";
import type { PolicyAction } from "@/lib/actions";

/** The signed-in responsible, as seen by the policy. Profiles are re-read on every request. */
export interface Actor {
  userId: string;
  name: string;
  email: string;
  profiles: ReadonlySet<Profile>;
}

/** What the policy needs to know about a person. Computed by `loadPersonFacts`. */
export interface PersonFacts {
  personId: string;
  status: PersonStatus;
  /** From `perimetersOf` (trainings, appointments, `isTrainer`). */
  perimeters: ReadonlySet<Perimeter>;
  /** Candidate, open candidacy, entered less than NEW_VOLUNTEER_MONTHS ago, or current mentee. */
  inDiamantScope: boolean;
  archived: boolean;
}

/** What the policy needs to know about a function (appointment rights). */
export interface FunctionFacts {
  code: string;
  managedBy: readonly Profile[];
}

/**
 * What the policy needs to know about a task (« À faire », step 16).
 * Only *active* links count (`removedAt` null). Computed by `loadTodoFacts`.
 */
export interface TodoFacts {
  todoId: string;
  ownerId: string;
  assigneeIds: readonly string[];
  /** Active members of the task's project (empty without project). */
  projectMemberIds: readonly string[];
  /** Active OWNERs of the task's project. */
  projectOwnerIds: readonly string[];
}

/** What the policy needs to know about a project. Computed by `loadProjectFacts`. */
export interface TodoProjectFacts {
  projectId: string;
  memberIds: readonly string[];
  ownerIds: readonly string[];
}

/** The object an action applies to. */
export interface PolicyResource {
  person?: PersonFacts;
  function?: FunctionFacts;
  todo?: TodoFacts;
  project?: TodoProjectFacts;
}

export interface PolicyDecision {
  allowed: boolean;
  /** Short French explanation, for logs and the 403 page. */
  reason: string;
}

export type { PolicyAction };
