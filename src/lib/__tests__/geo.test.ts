import { describe, expect, it } from "vitest";
import { departmentOf, foldPlace, normalizePostalCode, prettyCommune } from "@/lib/geo";

describe("normalizePostalCode", () => {
  it.each([
    ["78000", "78000"],
    ["78 000", "78000"],
    [" 01000 ", "01000"],
    ["1000", "01000"],
    ["7800", "07800"],
    ["780000", null],
    ["78A00", null],
    ["", null],
  ])("%s → %s", (raw, expected) => {
    expect(normalizePostalCode(raw)).toBe(expected);
  });
});

describe("departmentOf", () => {
  it.each([
    ["78000", null, "78"],
    ["01000", null, "01"],
    // Corsica: 2A below 20200, 2B from 20200; the INSEE code wins when known.
    ["20000", null, "2A"],
    ["20090", null, "2A"],
    ["20200", null, "2B"],
    ["20600", null, "2B"],
    ["20167", "2B000", "2B"],
    // Overseas: three digits.
    ["97400", null, "974"],
    ["97100", null, "971"],
    ["98000", null, "980"],
    ["abc", null, null],
  ])("%s (%s) → %s", (cp, insee, dep) => {
    expect(departmentOf(cp, insee)).toBe(dep);
  });
});

describe("communes", () => {
  it("writes La Poste's capitals as a readable name", () => {
    expect(prettyCommune("VERSAILLES")).toBe("Versailles");
    expect(prettyCommune("CLAIREFONTAINE EN YVELINES")).toBe("Clairefontaine en Yvelines");
    expect(prettyCommune("LA CELLE ST CLOUD")).toBe("La Celle St Cloud");
  });

  it("folds accents, hyphens and « St » for searching", () => {
    expect(foldPlace("Saint-Cyr-l'École")).toBe("saint cyr l ecole");
    expect(foldPlace("ST CYR L ECOLE")).toBe("saint cyr l ecole");
    expect(foldPlace("  Le   Chesnay ")).toBe("le chesnay");
  });
});
