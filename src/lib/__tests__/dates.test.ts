import { describe, expect, it } from "vitest";
import {
  daysBetween,
  formatDate,
  formatDateTime,
  formatDayWithWeekday,
  formatRelative,
  toParisDay,
} from "@/lib/dates";

describe("toParisDay", () => {
  it("returns the Paris calendar day at 00:00 UTC", () => {
    expect(toParisDay(new Date("2026-03-14T10:00:00Z")).toISOString()).toBe(
      "2026-03-14T00:00:00.000Z",
    );
  });
  it("switches day at midnight Paris time, not UTC", () => {
    expect(toParisDay(new Date("2026-03-14T23:30:00Z")).toISOString()).toBe(
      "2026-03-15T00:00:00.000Z",
    );
  });
});

describe("formatDate", () => {
  it("formats in French, Paris time zone", () => {
    // 23:30 UTC on 14 March is already 15 March in Paris (UTC+1).
    expect(formatDate(new Date("2026-03-14T23:30:00Z"))).toBe("15/03/2026");
  });

  it("accepts ISO strings and timestamps", () => {
    expect(formatDate("2026-01-05T10:00:00Z")).toBe("05/01/2026");
    expect(formatDate(Date.UTC(2026, 0, 5, 10))).toBe("05/01/2026");
  });

  it.each([null, undefined, "", "pas une date", "2026-13-45"])("returns — for %s", (input) => {
    expect(formatDate(input)).toBe("—");
  });
});

describe("formatDateTime", () => {
  it("renders date and time in Paris winter time (UTC+1)", () => {
    expect(formatDateTime(new Date("2026-01-10T09:05:00Z"))).toBe("10/01/2026 10:05");
  });

  it("renders Paris summer time (UTC+2)", () => {
    expect(formatDateTime(new Date("2026-07-10T09:05:00Z"))).toBe("10/07/2026 11:05");
  });

  it("returns — for invalid values", () => {
    expect(formatDateTime(null)).toBe("—");
    expect(formatDateTime("nope")).toBe("—");
  });
});

describe("formatRelative", () => {
  const now = new Date("2026-03-01T12:00:00Z");

  it("handles today, tomorrow and yesterday", () => {
    expect(formatRelative(now, now)).toBe("aujourd'hui");
    expect(formatRelative(new Date("2026-03-02T08:00:00Z"), now)).toBe("demain");
    expect(formatRelative(new Date("2026-02-28T20:00:00Z"), now)).toBe("hier");
  });

  it("counts days in the future and in the past", () => {
    expect(formatRelative(new Date("2026-04-28T12:00:00Z"), now)).toBe("dans 58 jours");
    expect(formatRelative(new Date("2026-02-24T12:00:00Z"), now)).toBe("il y a 5 jours");
  });

  it("is not shifted by the switch to summer time (29 March 2026)", () => {
    const before = new Date("2026-03-28T12:00:00Z");
    const after = new Date("2026-03-30T12:00:00Z");
    expect(daysBetween(before, after)).toBe(2);
    expect(formatRelative(after, before)).toBe("dans 2 jours");
  });

  it("is not shifted by the switch to winter time (25 October 2026)", () => {
    const before = new Date("2026-10-24T12:00:00Z");
    const after = new Date("2026-10-26T12:00:00Z");
    expect(daysBetween(before, after)).toBe(2);
    expect(formatRelative(before, after)).toBe("il y a 2 jours");
  });

  it("uses the Paris calendar day, not the UTC one", () => {
    // 23:30 UTC = 00:30 the next day in Paris → « demain ».
    expect(formatRelative(new Date("2026-03-01T23:30:00Z"), now)).toBe("demain");
  });

  it("returns — for missing or invalid values", () => {
    expect(formatRelative(null, now)).toBe("—");
    expect(formatRelative(undefined, now)).toBe("—");
    expect(formatRelative("invalide", now)).toBe("—");
  });
});

describe("formatDayWithWeekday", () => {
  it("prefixes the Paris weekday, capitalised", () => {
    // 23:30 UTC on Thursday 05/11/2026 is already Friday in Paris.
    expect(formatDayWithWeekday(new Date("2026-11-05T23:30:00Z"))).toBe("Vendredi 06/11/2026");
  });

  it("renders the placeholder for a missing date", () => {
    expect(formatDayWithWeekday(null)).toBe("—");
  });
});
