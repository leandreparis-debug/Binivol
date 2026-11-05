import { describe, expect, it } from "vitest";
import { formatPhone, normalizePhone, parsePhone, phoneHref } from "../phone";

describe("parsePhone", () => {
  it("restores the leading 0 of a 9-digit number", () => {
    expect(parsePhone(612345678)).toEqual({ value: "0612345678", normalized: true });
    expect(parsePhone(139980100)).toEqual({ value: "0139980100", normalized: true });
  });

  it.each([
    ["06 12 34 56 78", "0612345678"],
    ["06.12.34.56.78", "0612345678"],
    ["06-12-34-56-78", "0612345678"],
    ["+33 6 12 34 56 78", "0612345678"],
    ["+33 (0)6 12 34 56 78", "0612345678"],
    ["0033612345678", "0612345678"],
    ["612345678", "0612345678"],
    [" 0612345678 ", "0612345678"],
  ])("normalises the text %s", (input, expected) => {
    expect(parsePhone(input)).toEqual({ value: expected, normalized: true });
  });

  it("keeps anything else as written, flagged as not normalised", () => {
    expect(parsePhone("à demander")).toEqual({ value: "à demander", normalized: false });
    expect(parsePhone("+44 20 7946 0958")).toEqual({
      value: "+44 20 7946 0958",
      normalized: false,
    });
    expect(parsePhone(12345)).toEqual({ value: "12345", normalized: false });
    expect(parsePhone(6.5)).toEqual({ value: "6.5", normalized: false });
  });

  it("returns null for an empty value", () => {
    expect(parsePhone(null)).toEqual({ value: null, normalized: true });
    expect(parsePhone("   ")).toEqual({ value: null, normalized: true });
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("formatPhone and phoneHref", () => {
  it("shows a national number by pairs", () => {
    expect(formatPhone("0612345678")).toBe("06 12 34 56 78");
  });

  it("shows any other value as stored, and nothing for null", () => {
    expect(formatPhone("à demander")).toBe("à demander");
    expect(formatPhone(null)).toBe("");
  });

  it("links a national number in international form", () => {
    expect(phoneHref("0612345678")).toBe("tel:+33612345678");
    expect(phoneHref("+44 20 7946 0958")).toBe("tel:+442079460958");
  });
});
