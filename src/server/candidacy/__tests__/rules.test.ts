import { describe, expect, it } from "vitest";
import {
  canonicalSource,
  defaultFollowUp,
  followUpState,
  groupSources,
  idleDays,
  rankMentors,
} from "../rules";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const day = d("2026-11-05");

describe("follow-up and idle days", () => {
  it("classifies the follow-up date", () => {
    expect(followUpState(d("2026-11-04"), day)).toBe("overdue");
    expect(followUpState(d("2026-11-05"), day)).toBe("today");
    expect(followUpState(d("2026-11-06"), day)).toBe("planned");
    expect(followUpState(null, day)).toBe("none");
  });

  it("counts the days without action, never negative", () => {
    expect(idleDays(d("2026-10-26"), day)).toBe(10);
    expect(idleDays(d("2026-11-05"), day)).toBe(0);
    expect(idleDays(d("2026-11-08"), day)).toBe(0);
  });

  it("proposes the follow-up N days later", () => {
    expect(defaultFollowUp(day, 7).toISOString().slice(0, 10)).toBe("2026-11-12");
  });
});

describe("sources", () => {
  it("groups spellings without case nor accents, most used first", () => {
    expect(
      groupSources([
        "Site internet",
        "Site Internet",
        "site internet",
        " Forum   des associations ",
        "Forum des associations",
        "Bouche-à-oreille",
        "Bouche-a-oreille",
        null,
        "",
      ]),
    ).toEqual(["Site internet", "Bouche-à-oreille", "Forum des associations"]);
  });

  it("maps a typed source onto an existing one", () => {
    expect(canonicalSource("site INTERNET", ["Site internet"])).toBe("Site internet");
    expect(canonicalSource("Salon", ["Site internet"])).toBe("Salon");
    expect(canonicalSource("  ", ["Site internet"])).toBeNull();
  });
});

describe("rankMentors", () => {
  it("orders by current mentees, then seniority, then name", () => {
    const m = (id: string, activeMentees: number, entry: string | null, lastName = id) => ({
      id,
      activeMentees,
      entryDate: entry ? d(entry) : null,
      lastName,
      firstName: "A",
    });
    expect(
      rankMentors([
        m("busy", 2, "2010-01-01"),
        m("new", 0, "2025-01-01"),
        m("old", 0, "2012-01-01"),
        m("unknown", 0, null),
        m("one", 1, "2011-01-01"),
      ]).map((x) => x.id),
    ).toEqual(["old", "new", "unknown", "one", "busy"]);
  });
});
