import { describe, expect, it } from "vitest";
import {
  DEFAULT_INDICATORS,
  indicatorsToLines,
  linesToIndicators,
  parseIndicators,
} from "@/lib/indicators";

describe("DLUS indicators", () => {
  it("defaults: Secouristes first (the highlighted figure), unique keys", () => {
    expect(DEFAULT_INDICATORS[0]?.key).toBe("SECOURISTES");
    const keys = DEFAULT_INDICATORS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(DEFAULT_INDICATORS.find((i) => i.key === "BENURS")).toMatchObject({
      required: ["TCAU"],
      excluded: ["PSE", "PSE1", "PSE2"],
    });
  });

  it("round-trips through the settings lines", () => {
    expect(linesToIndicators(indicatorsToLines(DEFAULT_INDICATORS))).toEqual({
      ok: true,
      value: DEFAULT_INDICATORS,
    });
  });

  it("explains a bad line, a bad code, a duplicate key", () => {
    expect(linesToIndicators("X | Libellé | valide").ok).toBe(false);
    expect(linesToIndicators("AB | Libellé | autre | PSE").ok).toBe(false);
    expect(linesToIndicators("AB | Libellé | valide | P SE").ok).toBe(false);
    expect(linesToIndicators("AB | a | valide | PSE\nAB | b | inscription | PSE")).toEqual({
      ok: false,
      error: "La clé AB apparaît deux fois.",
    });
  });

  it("falls back to the defaults on an unreadable setting, skips ill-formed items", () => {
    expect(parseIndicators("x")).toBe(DEFAULT_INDICATORS);
    expect(
      parseIndicators([
        { key: "OK", label: "Ok", kind: "valid", required: ["pse"] },
        { key: "NO", label: "No", kind: "other", required: ["PSE"] },
      ]),
    ).toEqual([{ key: "OK", label: "Ok", kind: "valid", required: ["PSE"], excluded: [] }]);
  });
});
