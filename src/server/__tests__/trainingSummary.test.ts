import { describe, expect, it } from "vitest";
import {
  deadlineCounts,
  directorySummary,
  qualificationsOf,
  type SummaryRecord,
} from "../trainingSummary";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const day = d("2026-11-05");
const record = (over: Partial<SummaryRecord>): SummaryRecord => ({
  referenceId: "pse",
  code: "PSE",
  label: "PSE",
  category: "FORMATION_IS",
  sortOrder: 1,
  result: "PASSED",
  date: d("2025-01-01"),
  expiresAt: null,
  cancelledAt: null,
  ...over,
});

describe("qualificationsOf", () => {
  it("keeps the latest known expiry of a reference (a renewal replaces the old one)", () => {
    const [pse] = qualificationsOf(
      [record({ expiresAt: d("2025-12-31") }), record({ expiresAt: d("2026-12-31") })],
      day,
      60,
    );
    expect(pse).toMatchObject({ code: "PSE", deadline: "soon" });
    expect(pse?.expiresAt?.toISOString().slice(0, 10)).toBe("2026-12-31");
  });

  it("ignores failed and cancelled records, and orders by the reference list", () => {
    const states = qualificationsOf(
      [
        record({ referenceId: "tcau", code: "TCAU", sortOrder: 9 }),
        record({ result: "FAILED" }),
        record({ referenceId: "gqs", code: "GQS", sortOrder: 7, cancelledAt: new Date() }),
        record({ referenceId: "crb", code: "CRB", sortOrder: 8 }),
      ],
      day,
      60,
    );
    expect(states.map((s) => s.code)).toEqual(["CRB", "TCAU"]);
  });

  it("marks an unknown expiry « sans date »", () => {
    expect(qualificationsOf([record({ date: null })], day, 60)[0]?.deadline).toBe("none");
  });
});

describe("directorySummary and deadlineCounts", () => {
  const states = qualificationsOf(
    [
      record({ referenceId: "a", code: "A", sortOrder: 1, expiresAt: d("2026-01-01") }),
      record({ referenceId: "b", code: "B", sortOrder: 2, expiresAt: d("2026-12-01") }),
      record({ referenceId: "c", code: "C", sortOrder: 3 }),
      record({ referenceId: "e", code: "E", sortOrder: 4, expiresAt: d("2030-01-01") }),
      record({ referenceId: "f", code: "F", sortOrder: 5 }),
      record({ referenceId: "g", code: "G", sortOrder: 6 }),
    ],
    day,
    60,
  );

  it("shows three valid qualifications, « +N », and the most urgent deadline", () => {
    const summary = directorySummary(states);
    expect(summary.qualifications).toEqual(["B", "C", "E"]);
    expect(summary.extra).toBe(2);
    expect(summary.next).toMatchObject({ code: "A", deadline: "expired" });
  });

  it("counts each class", () => {
    expect(deadlineCounts(states)).toEqual({ ok: 1, soon: 1, expired: 1, none: 3 });
  });

  it("has no deadline without dated qualifications", () => {
    expect(directorySummary([]).next).toBeNull();
  });
});
