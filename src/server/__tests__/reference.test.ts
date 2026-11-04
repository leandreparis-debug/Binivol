// @vitest-environment node
import { describe, expect, it } from "vitest";
import { addMonthsUtc, computeExpiresAt, isValidOn } from "@/server/reference";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const iso = (date: Date | null) => date?.toISOString().slice(0, 10) ?? null;

describe("computeExpiresAt", () => {
  it("returns null for a reference without validity", () => {
    expect(
      computeExpiresAt({ validityMonths: null, expiresEndOfYear: false }, d("2026-03-10")),
    ).toBeNull();
  });

  it("adds the validity in months", () => {
    expect(
      iso(computeExpiresAt({ validityMonths: 36, expiresEndOfYear: false }, d("2024-03-15"))),
    ).toBe("2027-03-15");
  });

  it("clamps to the end of the month", () => {
    expect(
      iso(computeExpiresAt({ validityMonths: 1, expiresEndOfYear: false }, d("2026-01-31"))),
    ).toBe("2026-02-28");
    expect(iso(addMonthsUtc(d("2027-01-31"), 13))).toBe("2028-02-29");
  });

  it("expires on 31 December of the obtention year, December included", () => {
    const rule = { validityMonths: null, expiresEndOfYear: true };
    expect(iso(computeExpiresAt(rule, d("2026-03-02")))).toBe("2026-12-31");
    expect(iso(computeExpiresAt(rule, d("2026-12-15")))).toBe("2026-12-31");
    expect(iso(computeExpiresAt(rule, d("2026-12-31")))).toBe("2026-12-31");
  });

  it("combines months and 31 December", () => {
    expect(
      iso(computeExpiresAt({ validityMonths: 12, expiresEndOfYear: true }, d("2026-12-15"))),
    ).toBe("2027-12-31");
  });

  it("returns null when the obtention date is unknown or invalid", () => {
    const rule = { validityMonths: 36, expiresEndOfYear: false };
    expect(computeExpiresAt(rule, null)).toBeNull();
    expect(computeExpiresAt(rule, undefined)).toBeNull();
    expect(computeExpiresAt(rule, new Date("invalide"))).toBeNull();
  });

  it("ignores the time of day of the obtention date", () => {
    expect(
      iso(
        computeExpiresAt(
          { validityMonths: 12, expiresEndOfYear: false },
          new Date("2026-05-10T22:45:00Z"),
        ),
      ),
    ).toBe("2027-05-10");
  });
});

describe("isValidOn", () => {
  it("treats expiresAt as the last valid day", () => {
    expect(isValidOn(d("2026-11-04"), d("2026-11-04"))).toBe(true);
    expect(isValidOn(d("2026-11-03"), d("2026-11-04"))).toBe(false);
    expect(isValidOn(null, d("2026-11-04"))).toBe(true);
  });
});
