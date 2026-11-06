import { describe, expect, it } from "vitest";
import { gaiaToLines, parameterDef, parseParameter, PARAMETERS } from "../parameters";

const def = (key: string) => {
  const d = parameterDef(key);
  if (!d) throw new Error(key);
  return d;
};

describe("UL parameters", () => {
  it("every parameter has a theme, a label and a help", () => {
    for (const p of PARAMETERS) {
      expect(p.label.length).toBeGreaterThan(3);
      expect(p.help.length).toBeGreaterThan(10);
    }
  });

  it("numbers within their bounds", () => {
    expect(parseParameter(def("RETENTION_YEARS_AFTER_LEAVE"), "5")).toEqual({ ok: true, value: 5 });
    expect(parseParameter(def("RETENTION_YEARS_AFTER_LEAVE"), "0").ok).toBe(false);
    expect(parseParameter(def("ALERT_DAYS_BEFORE_EXPIRY"), "abc").ok).toBe(false);
  });

  it("enum, e-mail, Gaia lines", () => {
    expect(parseParameter(def("PURGE_MODE"), "AUTOMATIC")).toEqual({
      ok: true,
      value: "AUTOMATIC",
    });
    expect(parseParameter(def("PURGE_MODE"), "SOMETIMES").ok).toBe(false);
    expect(parseParameter(def("UL_CONTACT_EMAIL"), "pas-une-adresse").ok).toBe(false);
    expect(parseParameter(def("UL_CONTACT_EMAIL"), "")).toEqual({ ok: true, value: "" });
    const lines = "created | Personne créée\nadhesion | Adhésion | adhésion";
    const parsed = parseParameter(def("GAIA_CHECKLIST"), lines);
    expect(parsed).toEqual({
      ok: true,
      value: [
        { key: "created", label: "Personne créée" },
        { key: "adhesion", label: "Adhésion", onlyIfAdhesion: true },
      ],
    });
    if (parsed.ok) expect(gaiaToLines(parsed.value as never)).toBe(lines);
    expect(parseParameter(def("GAIA_CHECKLIST"), "clé avec espaces | x").ok).toBe(false);
    expect(parseParameter(def("GAIA_CHECKLIST"), "a | x\na | y").ok).toBe(false);
  });
});
