import type { Perimeter, Profile } from "@/generated/prisma/enums";
import { POLICY_ACTIONS, type PolicyAction } from "@/lib/actions";

/**
 * The access matrix, as data. `can()` applies it; `pnpm docs:permissions`
 * turns it into docs/permissions.md. Change the rules here, nowhere else.
 */

/**
 * When a grant applies.
 * - `always`: no condition (resource-less actions, or TOPAZE);
 * - `notArchived`: the person is not archived;
 * - `notArchivedNotCandidate`: the person is neither archived nor a candidate;
 * - `inScope`: the person « relève » of the profile (see `relevesOf`);
 * - `managedFunctionInScope`: the function lists the profile in `managedBy`
 *   and the person relève of that profile.
 */
export type Condition =
  "always" | "notArchived" | "notArchivedNotCandidate" | "inScope" | "managedFunctionInScope";

/** What an action applies to: nothing, a person, or a person and a function. */
export type Target = "none" | "person" | "personAndFunction";

export interface Grant {
  profiles: readonly Profile[];
  when: Condition;
}

export interface ActionRule {
  target: Target;
  grants: readonly Grant[];
}

export const ALL_PROFILES: readonly Profile[] = [
  "TOPAZE",
  "ACTION",
  "LASER",
  "FORMAT",
  "FORMAT_GP",
  "DIAMANT",
];

/** Profiles whose scope is a perimeter of the reference list. */
export const PROFILE_PERIMETER: Partial<Record<Profile, Perimeter>> = {
  ACTION: "ACTION",
  LASER: "LASER",
  FORMAT_GP: "FORMAT_GP",
};

const TOPAZE: Grant = { profiles: ["TOPAZE"], when: "always" };
const SCOPED: readonly Profile[] = ["ACTION", "LASER", "FORMAT_GP", "DIAMANT"];
const topazeOnly = (target: Target): ActionRule => ({ target, grants: [TOPAZE] });
const diamantInScope = (target: Target): ActionRule => ({
  target,
  grants: [TOPAZE, { profiles: ["DIAMANT"], when: "inScope" }],
});
const personRead: ActionRule = {
  target: "person",
  grants: [TOPAZE, { profiles: SCOPED, when: "inScope" }],
};
const formatTraining = (target: Target): ActionRule => ({
  target,
  grants: [
    TOPAZE,
    { profiles: ["FORMAT"], when: target === "none" ? "always" : "notArchivedNotCandidate" },
  ],
});

export const MATRIX = {
  "person.directory.read": {
    target: "person",
    grants: [
      TOPAZE,
      { profiles: ["DIAMANT"], when: "notArchived" },
      { profiles: ALL_PROFILES, when: "notArchivedNotCandidate" },
    ],
  },
  "person.full.read": personRead,
  "person.sensitive.read": personRead,
  "person.update": diamantInScope("person"),
  "person.status.change": topazeOnly("person"),
  // The NIVOL is normally set by the Gaia assistant (step 9): only TOPAZE corrects it.
  "person.nivol.correct": topazeOnly("person"),
  "training.read": {
    target: "person",
    grants: [
      TOPAZE,
      { profiles: ["FORMAT"], when: "notArchivedNotCandidate" },
      { profiles: SCOPED, when: "inScope" },
    ],
  },
  "training.write": formatTraining("person"),
  "trainingSession.manage": formatTraining("none"),
  "trainingWish.manage": formatTraining("person"),
  "appointment.read": personRead,
  "appointment.write": {
    target: "personAndFunction",
    // Only profiles with a perimeter can be given a function (managedBy).
    grants: [
      TOPAZE,
      { profiles: ["ACTION", "LASER", "FORMAT_GP"], when: "managedFunctionInScope" },
    ],
  },
  "candidacy.manage": diamantInScope("person"),
  "dossier.manage": diamantInScope("person"),
  "mentorship.manage": diamantInScope("person"),
  "followUp.manage": diamantInScope("person"),
  "document.read": personRead,
  "document.upload": diamantInScope("person"),
  "document.archived.read": topazeOnly("person"),
  "user.manage": topazeOnly("none"),
  "reference.manage": topazeOnly("none"),
  "setting.manage": topazeOnly("none"),
  "reminderRule.manage": topazeOnly("none"),
  "audit.read": topazeOnly("none"),
  "accessLog.read": topazeOnly("none"),
  "person.export": topazeOnly("none"),
  "import.run": topazeOnly("none"),
  "notification.readOwn": { target: "none", grants: [{ profiles: ALL_PROFILES, when: "always" }] },
} as const satisfies Record<PolicyAction, ActionRule>;

/** Every action of the matrix, in the documented order. */
export const MATRIX_ACTIONS: readonly PolicyAction[] = POLICY_ACTIONS;

/** French wording of each condition (docs, `/moi`). */
export const CONDITION_LABELS: Record<Condition, string> = {
  always: "Oui",
  notArchived: "Oui, sauf personne archivée",
  notArchivedNotCandidate: "Oui, sauf candidat ou personne archivée",
  inScope: "Si la personne relève du profil",
  managedFunctionInScope: "Si la fonction lui est confiée et que la personne relève du profil",
};

/** From the most to the least permissive, to summarise several grants. */
export const CONDITION_ORDER: readonly Condition[] = [
  "always",
  "notArchived",
  "notArchivedNotCandidate",
  "inScope",
  "managedFunctionInScope",
];
