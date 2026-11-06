import { describe, expect, it } from "vitest";
import {
  catalogToLines,
  DEFAULT_DIPLOMA_CATALOG,
  diplomaPdfText,
  linesToCatalog,
  parseDiplomaCatalog,
  searchCatalog,
} from "@/lib/diplomas";
import { dossierDraftSchema, submissionIssues } from "@/lib/dossierSchema";

describe("diploma catalogue", () => {
  it("has no duplicate code, and uses the reference codes when they exist", () => {
    const codes = DEFAULT_DIPLOMA_CATALOG.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of ["PSC", "GQS", "FCPSE", "FPSC", "FPSE", "TCAU"]) {
      expect(DEFAULT_DIPLOMA_CATALOG.find((c) => c.code === code)?.reference).toBe(code);
    }
    expect(DEFAULT_DIPLOMA_CATALOG.find((c) => c.code === "PSE2")?.reference).toBe("PSE");
  });

  it("searches codes and words, accents ignored", () => {
    expect(searchCatalog(DEFAULT_DIPLOMA_CATALOG, "pse2").map((c) => c.code)).toEqual(["PSE2"]);
    expect(searchCatalog(DEFAULT_DIPLOMA_CATALOG, "aquatique").map((c) => c.code)).toEqual([
      "BNSSA",
      "SSA",
    ]);
    expect(searchCatalog(DEFAULT_DIPLOMA_CATALOG, "prevention").map((c) => c.code)).toEqual([
      "PSC",
    ]);
  });

  it("round-trips through the settings lines, refuses bad lines and duplicates", () => {
    const parsed = linesToCatalog(catalogToLines(DEFAULT_DIPLOMA_CATALOG));
    expect(parsed).toEqual({ ok: true, value: DEFAULT_DIPLOMA_CATALOG });
    expect(linesToCatalog("pse 1 | x").ok).toBe(false);
    expect(linesToCatalog("A | x\nA | y")).toEqual({
      ok: false,
      error: "Le code A apparaît deux fois.",
    });
  });

  it("falls back to the default catalogue on an unreadable setting", () => {
    expect(parseDiplomaCatalog(null)).toBe(DEFAULT_DIPLOMA_CATALOG);
    expect(parseDiplomaCatalog([{ code: "x y", label: "" }])).toBe(DEFAULT_DIPLOMA_CATALOG);
    expect(parseDiplomaCatalog([{ code: "bafa", label: "BAFA" }])).toEqual([
      { code: "BAFA", label: "BAFA", group: "Autres" },
    ]);
  });

  it("fills the PDF box with the label and the year", () => {
    expect(diplomaPdfText({ label: "PSE1", year: "2021" })).toBe("PSE1 (2021)");
    expect(diplomaPdfText({ label: "BAFA" })).toBe("BAFA");
  });
});

describe("declared diplomas in the dossier", () => {
  it("reads a plain text of an older version as { label }", () => {
    const parsed = dossierDraftSchema.parse({ profile: { diplomas: ["BAFA"] } });
    expect(parsed.profile?.diplomas).toEqual([{ label: "BAFA" }]);
  });

  it("refuses a malformed or future year at submission", () => {
    const day = new Date("2026-11-06T00:00:00Z");
    const issues = (year: string) =>
      submissionIssues(
        { profile: { diplomas: [{ code: "PSE1", label: "PSE1", year }] } },
        { day, attachmentKinds: [] },
      ).filter((i) => i.field === "diplomas.0.year");
    expect(issues("2021")).toEqual([]);
    expect(issues("21")).toHaveLength(1);
    expect(issues("2030")).toHaveLength(1);
  });
});
