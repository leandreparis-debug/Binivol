import { describe, expect, it } from "vitest";
import { formatNivol, isValidNivolFormat } from "@/lib/nivol";

describe("formatNivol", () => {
  it("returns the value unchanged, trimmed", () => {
    expect(formatNivol(" DEMO00001 ")).toBe("DEMO00001");
  });
  it("returns — when missing", () => {
    expect(formatNivol(null)).toBe("—");
    expect(formatNivol("")).toBe("—");
  });
});

describe("isValidNivolFormat", () => {
  it("accepts 6 to 20 alphanumeric characters", () => {
    expect(isValidNivolFormat("ABC123")).toBe(true);
    expect(isValidNivolFormat("A".repeat(20))).toBe(true);
    expect(isValidNivolFormat("DEMO 00001")).toBe(true);
  });
  it("rejects too short, too long or non alphanumeric values", () => {
    expect(isValidNivolFormat("ABC12")).toBe(false);
    expect(isValidNivolFormat("A".repeat(21))).toBe(false);
    expect(isValidNivolFormat("ABC-123")).toBe(false);
    expect(isValidNivolFormat("")).toBe(false);
    expect(isValidNivolFormat(null)).toBe(false);
  });
});
