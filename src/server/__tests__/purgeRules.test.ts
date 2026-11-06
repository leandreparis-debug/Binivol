import { describe, expect, it } from "vitest";
import { pseudonym, purgeRuleOf, type PurgeFacts } from "../purgeRules";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const day = d("2026-11-06");
const base: PurgeFacts = {
  status: "LEFT",
  purgeEligibleAt: d("2026-11-06"),
  entryDate: d("2015-01-01"),
  nivol: "00012345678A",
  candidacies: [],
};

describe("purge eligibility", () => {
  it("a person who left, once the retention is over", () => {
    expect(purgeRuleOf(base, day, 12)).toBe("RETENTION");
    expect(purgeRuleOf({ ...base, purgeEligibleAt: d("2026-11-07") }, day, 12)).toBeNull();
    expect(purgeRuleOf({ ...base, purgeEligibleAt: null }, day, 12)).toBeNull();
    expect(purgeRuleOf({ ...base, status: "ACTIVE" }, day, 12)).toBeNull();
  });

  it("an abandoned candidate who never became a volunteer, after N months", () => {
    const candidate: PurgeFacts = {
      status: "CANDIDATE",
      purgeEligibleAt: null,
      entryDate: null,
      nivol: null,
      candidacies: [{ stage: "ABANDONED", closedAt: d("2025-11-06") }],
    };
    expect(purgeRuleOf(candidate, day, 12)).toBe("ABANDONED");
    expect(
      purgeRuleOf(
        { ...candidate, candidacies: [{ stage: "ABANDONED", closedAt: d("2025-11-07") }] },
        day,
        12,
      ),
    ).toBeNull();
    // An open candidacy, a volunteer past, or no candidacy: never.
    expect(
      purgeRuleOf(
        {
          ...candidate,
          candidacies: [...candidate.candidacies, { stage: "MEETING", closedAt: null }],
        },
        day,
        12,
      ),
    ).toBeNull();
    expect(purgeRuleOf({ ...candidate, entryDate: d("2020-01-01") }, day, 12)).toBeNull();
    expect(purgeRuleOf({ ...candidate, candidacies: [] }, day, 12)).toBeNull();
  });

  it("pseudonyms are random, never derived from the identifier", () => {
    const a = pseudonym();
    expect(a).toMatch(/^purge_[0-9a-f]{18}$/);
    expect(pseudonym()).not.toBe(a);
  });
});
