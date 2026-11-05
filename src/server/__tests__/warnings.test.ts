import { describe, expect, it } from "vitest";
import {
  appointmentWarnings,
  trainingWarnings,
  warningsKey,
  type TrainingCandidate,
} from "../warnings";

const today = new Date("2026-11-06T00:00:00.000Z");
const pse2 = {
  code: "PSE2",
  label: "Premiers secours en équipe 2",
  prerequisites: [{ code: "PSE1", label: "PSE1" }],
};
const person = (over: Partial<TrainingCandidate>): TrainingCandidate => ({
  id: "p1",
  name: "Camille Fictive",
  status: "ACTIVE",
  validCodes: new Set(["PSE1"]),
  sameTrainingDates: [],
  ...over,
});

describe("training warnings (never blocking)", () => {
  it("none for a clean entry", () => {
    expect(
      trainingWarnings(
        { reference: pse2, date: new Date("2026-10-01T00:00:00Z"), result: "PASSED", today },
        [person({})],
      ),
    ).toEqual([]);
  });

  it("each warning, for the whole group at once", () => {
    const date = new Date("2026-12-01T00:00:00Z");
    const warnings = trainingWarnings(
      { reference: pse2, date, result: "PASSED", today, session: { capacity: 2, registered: 1 } },
      [
        person({ id: "a", name: "A Fictive", validCodes: new Set() }),
        person({ id: "b", name: "B Fictif", status: "LEFT", sameTrainingDates: ["2026-12-01"] }),
      ],
    );
    expect(warnings.map((w) => [w.code, w.personId ?? null])).toEqual([
      ["FUTURE_DATE", null],
      ["SESSION_FULL", null],
      ["MISSING_PREREQUISITE", "a"],
      ["NOT_PRESENT", "b"],
      ["DUPLICATE_SESSION", "b"],
    ]);
    expect(warnings[1]?.message).toBe("La session est complète : 3 inscrits pour 2 places.");
    expect(warnings[2]?.message).toContain("PSE1");
    expect(warnings[3]?.message).toContain("parti");
    expect(warningsKey(warnings)).toBe(
      "DUPLICATE_SESSION:b|FUTURE_DATE:|MISSING_PREREQUISITE:a|NOT_PRESENT:b|SESSION_FULL:",
    );
  });

  it("a future date is fine for a registration", () => {
    expect(
      trainingWarnings(
        { reference: pse2, date: new Date("2027-01-01T00:00:00Z"), result: "REGISTERED", today },
        [person({})],
      ),
    ).toEqual([]);
  });
});

describe("appointment warnings", () => {
  it("no authorizer, not present", () => {
    expect(
      appointmentWarnings({ name: "A", status: "ACTIVE", authorizedBy: "DLUS (fictif)" }),
    ).toEqual([]);
    expect(
      appointmentWarnings({ name: "A", status: "CANDIDATE", authorizedBy: " " }).map((w) => w.code),
    ).toEqual(["NO_AUTHORIZER", "NOT_PRESENT"]);
  });
});
