import { describe, expect, it } from "vitest";
import {
  b3Due,
  decideStatusChange,
  followUpBucket,
  mentorProblem,
  mentorshipEndSuggested,
  nextAnniversary,
  purgeEligibleAt,
} from "../statusRules";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("status transitions", () => {
  it.each([
    ["ACTIVE", "PAUSED", "pause", ["pausedAt"]],
    ["PAUSED", "ACTIVE", "resume", []],
    ["ACTIVE", "LEFT", "leave", ["leftAt", "leftReason"]],
    ["PAUSED", "LEFT", "leave", ["leftAt", "leftReason"]],
    ["LEFT", "ACTIVE", "return", ["reason"]],
    ["ACTIVE", "SUSPENDED", "other", []],
    ["INACTIVE", "ACTIVE", "other", []],
  ] as const)("%s → %s: %s", (from, to, kind, requires) => {
    expect(decideStatusChange(from, to)).toEqual({ allowed: true, kind, requires });
  });

  it("refuses a candidate, a return to candidate and a no-op", () => {
    expect(decideStatusChange("CANDIDATE", "ACTIVE").allowed).toBe(false);
    expect(decideStatusChange("ACTIVE", "CANDIDATE").allowed).toBe(false);
    expect(decideStatusChange("ACTIVE", "ACTIVE").allowed).toBe(false);
  });
});

describe("dates", () => {
  it("annual follow-up on the entry anniversary, strictly after the point", () => {
    expect(nextAnniversary(d("2024-03-15"), d("2026-11-06"))).toEqual(d("2027-03-15"));
    expect(nextAnniversary(d("2024-03-15"), d("2027-03-15"))).toEqual(d("2028-03-15"));
    expect(nextAnniversary(d("2024-02-29"), d("2026-01-01"))).toEqual(d("2026-02-28"));
    expect(nextAnniversary(null, d("2026-11-06"))).toEqual(d("2027-11-06"));
  });

  it("retention: departure + N years", () => {
    expect(purgeEligibleAt(d("2020-06-30"), 5)).toEqual(d("2025-06-30"));
  });

  it("board buckets", () => {
    const day = d("2026-11-06");
    expect(followUpBucket(d("2026-11-05"), day)).toBe("overdue");
    expect(followUpBucket(d("2026-11-13"), day)).toBe("week");
    expect(followUpBucket(d("2026-12-01"), day)).toBe("month");
    expect(followUpBucket(d("2027-01-15"), day)).toBe("later");
  });
});

describe("mentorship and B3", () => {
  it("suggests (never imposes) the end after 12 months", () => {
    expect(mentorshipEndSuggested(d("2025-10-01"), 12, d("2026-11-06"))).toBe(true);
    expect(mentorshipEndSuggested(d("2026-01-01"), 12, d("2026-11-06"))).toBe(false);
  });

  it("a mentor is present and not the mentee", () => {
    expect(mentorProblem({ id: "a" }, { id: "a", status: "ACTIVE" })).toMatch(/propre filleul/);
    expect(mentorProblem({ id: "a" }, { id: "b", status: "LEFT" })).toMatch(/présent/);
    expect(mentorProblem({ id: "a" }, { id: "b", status: "PAUSED" })).toBeNull();
  });

  it("one B3 check per civil year", () => {
    const day = d("2026-11-06");
    expect(b3Due(null, day)).toBe(true);
    expect(b3Due(d("2025-12-31"), day)).toBe(true);
    expect(b3Due(d("2026-01-02"), day)).toBe(false);
  });
});
