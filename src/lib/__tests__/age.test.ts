import { describe, expect, it } from "vitest";
import { adultBornOnOrBefore, ageOn, formatAge, formatSeniority, isMinorOn } from "../age";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("ageOn and isMinorOn", () => {
  it("counts whole years, the birthday included", () => {
    expect(ageOn(d("2008-11-05"), d("2026-11-05"))).toBe(18);
    expect(ageOn(d("2008-11-06"), d("2026-11-05"))).toBe(17);
    expect(ageOn(d("1990-01-01"), d("2026-11-05"))).toBe(36);
  });

  it("handles a 29 February birthday", () => {
    expect(ageOn(d("2008-02-29"), d("2026-02-28"))).toBe(17);
    expect(ageOn(d("2008-02-29"), d("2026-03-01"))).toBe(18);
  });

  it("is unknown without a birth date, and then not a minor", () => {
    expect(ageOn(null, d("2026-11-05"))).toBeNull();
    expect(isMinorOn(null, d("2026-11-05"))).toBe(false);
  });

  it("flags a minor until the 18th birthday", () => {
    expect(isMinorOn(d("2008-11-06"), d("2026-11-05"))).toBe(true);
    expect(isMinorOn(d("2008-11-05"), d("2026-11-05"))).toBe(false);
  });

  it("gives the SQL threshold consistent with isMinorOn", () => {
    for (const day of ["2026-11-05", "2026-02-28", "2028-02-29", "2026-01-01"]) {
      const threshold = adultBornOnOrBefore(d(day));
      expect(isMinorOn(threshold, d(day))).toBe(false);
      expect(isMinorOn(new Date(threshold.getTime() + 86_400_000), d(day))).toBe(true);
    }
  });
});

describe("formatAge and formatSeniority", () => {
  it("writes the age in French", () => {
    expect(formatAge(34)).toBe("34 ans");
    expect(formatAge(1)).toBe("1 an");
    expect(formatAge(null)).toBe("");
  });

  it("writes the seniority in years and months", () => {
    expect(formatSeniority(d("2023-09-10"), d("2026-11-05"))).toBe("3 ans et 1 mois");
    expect(formatSeniority(d("2025-11-05"), d("2026-11-05"))).toBe("1 an");
    expect(formatSeniority(d("2026-06-01"), d("2026-11-05"))).toBe("5 mois");
    expect(formatSeniority(d("2026-10-20"), d("2026-11-05"))).toBe("moins d'un mois");
    expect(formatSeniority(null, d("2026-11-05"))).toBe("");
    expect(formatSeniority(d("2027-01-01"), d("2026-11-05"))).toBe("");
  });
});
