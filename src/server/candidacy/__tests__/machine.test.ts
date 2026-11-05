import { describe, expect, it } from "vitest";
import type { CandidacyStage } from "@/generated/prisma/enums";
import {
  ALL_STAGES,
  availableTransitions,
  decideTransition,
  stageProgress,
  type RequiredField,
  type TransitionKind,
} from "../machine";

type Expected = [TransitionKind, RequiredField[]] | null;
const A: Expected = ["advance", []];
const B: Expected = ["back", ["note"]];
const X: Expected = ["abandon", ["abandonReason"]];
const F: Expected = ["finalize", ["nivol", "entryDate"]];
const _ = null;

/**
 * Every pair (from row, to column). Order of the columns:
 * FIRST_CONTACT, MEETING, CONFIRMED, FILE, GAIA, DONE, ABANDONED.
 */
const TABLE: Record<CandidacyStage, Expected[]> = {
  FIRST_CONTACT: [_, A, A, _, _, _, X],
  MEETING: [B, _, A, _, _, _, X],
  CONFIRMED: [B, B, _, A, _, _, X],
  FILE: [B, B, B, _, A, _, X],
  GAIA: [B, B, B, B, _, F, X],
  DONE: [_, _, _, _, _, _, _],
  ABANDONED: [_, _, _, _, _, _, _], // without context: no known abandonment stage
};

describe("decideTransition: every pair of stages", () => {
  for (const from of ALL_STAGES) {
    for (const [i, to] of ALL_STAGES.entries()) {
      const expected = TABLE[from][i] ?? null;
      it(`${from} → ${to}: ${expected ? expected[0] : "refused"}`, () => {
        const decision = decideTransition(from, to);
        if (expected) {
          expect(decision).toMatchObject({
            allowed: true,
            kind: expected[0],
            requires: expected[1],
          });
        } else {
          expect(decision.allowed).toBe(false);
          if (!decision.allowed) expect(decision.reason.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

describe("resume from ABANDONED", () => {
  it.each(["FIRST_CONTACT", "MEETING", "CONFIRMED", "FILE", "GAIA"] as const)(
    "abandoned at %s: resumes there only",
    (stage) => {
      for (const to of ALL_STAGES) {
        const decision = decideTransition("ABANDONED", to, { abandonedFrom: stage });
        expect(decision.allowed, `${stage} → ${to}`).toBe(to === stage);
        if (decision.allowed) expect(decision).toMatchObject({ kind: "resume", requires: [] });
      }
    },
  );

  it("refuses a resume without a known abandonment stage", () => {
    expect(decideTransition("ABANDONED", "MEETING", { abandonedFrom: null }).allowed).toBe(false);
    expect(decideTransition("ABANDONED", "MEETING", { abandonedFrom: "DONE" }).allowed).toBe(false);
  });
});

describe("availableTransitions and stageProgress", () => {
  it("lists the buttons of each stage in path order", () => {
    expect(availableTransitions("FIRST_CONTACT").map((t) => t.to)).toEqual([
      "MEETING",
      "CONFIRMED",
      "ABANDONED",
    ]);
    expect(availableTransitions("GAIA").map((t) => t.kind)).toEqual([
      "back",
      "back",
      "back",
      "back",
      "finalize",
      "abandon",
    ]);
    expect(availableTransitions("DONE")).toEqual([]);
    expect(availableTransitions("ABANDONED", { abandonedFrom: "FILE" }).map((t) => t.to)).toEqual([
      "FILE",
    ]);
  });

  it("gives the progress on the 6-step path", () => {
    expect(ALL_STAGES.map(stageProgress)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});
