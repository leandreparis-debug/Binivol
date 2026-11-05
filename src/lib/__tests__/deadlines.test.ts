import { describe, expect, it } from "vitest";
import { classifyDeadline, DEADLINE_CLASS_LABELS } from "../deadlines";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const day = d("2026-11-05");

describe("classifyDeadline", () => {
  it.each([
    [null, "none"],
    ["2026-11-04", "expired"],
    ["2026-11-05", "soon"],
    ["2027-01-04", "soon"],
    ["2027-01-05", "ok"],
  ] as const)("%s → %s with 60 days of alert", (expiry, expected) => {
    expect(classifyDeadline(expiry ? d(expiry) : null, day, 60)).toBe(expected);
  });

  it("has a French label for each class", () => {
    expect(DEADLINE_CLASS_LABELS).toEqual({
      ok: "À jour",
      soon: "Échéance proche",
      expired: "Expirée",
      none: "Sans date",
    });
  });
});
