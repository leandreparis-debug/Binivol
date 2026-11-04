import { describe, expect, it } from "vitest";
import { NIVOL_EXAMPLE, formatNivol, isValidNivolFormat, normalizeNivol } from "@/lib/nivol";

describe("normalizeNivol", () => {
  it("returns a valid NIVOL unchanged", () => {
    expect(normalizeNivol(NIVOL_EXAMPLE)).toBe("00012345678A");
  });

  it("removes spaces and upper-cases the letter", () => {
    expect(normalizeNivol(" 000 1234 5678 a ")).toBe("00012345678A");
    expect(normalizeNivol("00012345678\ta")).toBe("00012345678A");
  });

  it.each([
    ["too short", "0001234567A"],
    ["too long", "000123456789A"],
    ["letter missing", "000123456789"],
    ["letter not last", "A00012345678"],
    ["two letters", "0001234567AB"],
    ["accented letter", "00012345678É"],
    ["punctuation", "000-12345678A"],
    ["empty", ""],
    ["blank", "   "],
  ])("returns null when %s", (_label, value) => {
    expect(normalizeNivol(value)).toBeNull();
  });

  it("returns null for null and undefined", () => {
    expect(normalizeNivol(null)).toBeNull();
    expect(normalizeNivol(undefined)).toBeNull();
  });
});

describe("isValidNivolFormat", () => {
  it("accepts 11 digits followed by a letter", () => {
    expect(isValidNivolFormat("00012345678A")).toBe(true);
    expect(isValidNivolFormat("000 12345678 z")).toBe(true);
  });

  it("rejects the old loose format", () => {
    expect(isValidNivolFormat("ABC123")).toBe(false);
    expect(isValidNivolFormat("DEMO00001")).toBe(false);
    expect(isValidNivolFormat(null)).toBe(false);
  });
});

describe("formatNivol", () => {
  it("shows the normalised form when valid", () => {
    expect(formatNivol(" 00012345678a ")).toBe("00012345678A");
  });
  it("shows an invalid value trimmed, as is", () => {
    expect(formatNivol(" ABC ")).toBe("ABC");
  });
  it("returns — when missing", () => {
    expect(formatNivol(null)).toBe("—");
    expect(formatNivol("")).toBe("—");
  });
});
