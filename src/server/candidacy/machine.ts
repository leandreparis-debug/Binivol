import type { CandidacyStage } from "@/generated/prisma/enums";

/**
 * The candidacy state machine: every allowed change of stage, what it
 * requires and what it is called. **Pure** (no database, no clock): the
 * services enforce it on every write, the screens ask it which buttons to
 * show, and `__tests__/machine.test.ts` checks every pair of stages.
 *
 * Path: FIRST_CONTACT → MEETING → CONFIRMED → FILE → GAIA → DONE, plus
 * ABANDONED.
 * - forward: one stage, or a jump up to CONFIRMED at most (FILE and GAIA are
 *   reached from the stage just before);
 * - back: to any earlier open stage, with a mandatory note;
 * - abandon: from any open stage, with a reason (note optional);
 * - resume: from ABANDONED, back to the stage of the abandonment only;
 * - finalize: GAIA → DONE only, through the finalisation (NIVOL, entry date);
 * - DONE is final.
 */

/** Open stages, in order. */
export const OPEN_STAGES = ["FIRST_CONTACT", "MEETING", "CONFIRMED", "FILE", "GAIA"] as const;
export type OpenStage = (typeof OPEN_STAGES)[number];

export const ALL_STAGES: readonly CandidacyStage[] = [...OPEN_STAGES, "DONE", "ABANDONED"];

/** The furthest stage a forward jump may reach. */
export const MAX_JUMP: OpenStage = "CONFIRMED";

export type TransitionKind = "advance" | "back" | "abandon" | "resume" | "finalize";

/** Fields a transition requires in its request. */
export type RequiredField = "note" | "abandonReason" | "nivol" | "entryDate";

export interface AllowedTransition {
  allowed: true;
  kind: TransitionKind;
  from: CandidacyStage;
  to: CandidacyStage;
  requires: readonly RequiredField[];
}

export interface RefusedTransition {
  allowed: false;
  from: CandidacyStage;
  to: CandidacyStage;
  /** French reason, safe to show. */
  reason: string;
}

export type TransitionDecision = AllowedTransition | RefusedTransition;

export interface MachineContext {
  /** Stage at which the candidacy was abandoned (resume target). */
  abandonedFrom?: CandidacyStage | null;
}

export function isOpenStage(stage: CandidacyStage): stage is OpenStage {
  return (OPEN_STAGES as readonly string[]).includes(stage);
}

function indexOf(stage: OpenStage): number {
  return OPEN_STAGES.indexOf(stage);
}

const allowed = (
  kind: TransitionKind,
  from: CandidacyStage,
  to: CandidacyStage,
  requires: RequiredField[] = [],
): AllowedTransition => ({ allowed: true, kind, from, to, requires });

const refused = (from: CandidacyStage, to: CandidacyStage, reason: string): RefusedTransition => ({
  allowed: false,
  from,
  to,
  reason,
});

/** Decides whether a candidacy may go from `from` to `to`. */
export function decideTransition(
  from: CandidacyStage,
  to: CandidacyStage,
  context: MachineContext = {},
): TransitionDecision {
  if (from === to) return refused(from, to, "La candidature est déjà à cette étape.");
  if (from === "DONE") return refused(from, to, "Une candidature intégrée est close.");

  if (from === "ABANDONED") {
    if (to === "DONE")
      return refused(from, to, "Une candidature abandonnée ne s'intègre pas directement.");
    if (!context.abandonedFrom || !isOpenStage(context.abandonedFrom)) {
      return refused(from, to, "Étape d'abandon inconnue : reprise impossible.");
    }
    return to === context.abandonedFrom
      ? allowed("resume", from, to)
      : refused(from, to, "Une reprise rouvre la candidature à l'étape de son abandon.");
  }

  // `from` is an open stage from here on.
  if (to === "ABANDONED") return allowed("abandon", from, to, ["abandonReason"]);
  if (to === "DONE") {
    return from === "GAIA"
      ? allowed("finalize", from, to, ["nivol", "entryDate"])
      : refused(from, to, "L'intégration se finalise depuis l'étape Gaia.");
  }
  const a = indexOf(from);
  const b = indexOf(to);
  if (b < a) return allowed("back", from, to, ["note"]);
  if (b === a + 1) return allowed("advance", from, to);
  if (b <= indexOf(MAX_JUMP)) return allowed("advance", from, to);
  return refused(from, to, "Les étapes Dossier et Gaia s'atteignent depuis l'étape juste avant.");
}

/** Every transition allowed from `from`, in path order (for the buttons). */
export function availableTransitions(
  from: CandidacyStage,
  context: MachineContext = {},
): AllowedTransition[] {
  return ALL_STAGES.map((to) => decideTransition(from, to, context)).filter(
    (d): d is AllowedTransition => d.allowed,
  );
}

/** Progress of a stage on the 6-step path (DONE = 6), for the hatched bar. */
export function stageProgress(stage: CandidacyStage): number {
  if (stage === "DONE") return 6;
  if (stage === "ABANDONED") return 0;
  return indexOf(stage) + 1;
}
