// @vitest-environment node
import { PDFCheckBox, PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { seedDossierData } from "../../../../prisma/seed/index";
import { fakeSignature } from "@/test/png";
import { pdfText } from "@/test/pdfText";
import { renderTemplate } from "../fill";
import { MAPPINGS, splitStructure, type MappingContext } from "../mappings";
import { fitText, isoDayParts, parisDateParts, parisDay } from "../text";
import {
  assertIntact,
  loadFont,
  loadTemplate,
  sha256,
  TEMPLATES,
  TemplateModifiedError,
  verifyTemplates,
  type TemplateKey,
} from "../templates";

const KEYS = Object.keys(TEMPLATES) as TemplateKey[];
const today = new Date("2026-11-05T00:00:00.000Z");
const signedAt = new Date("2026-11-05T14:30:00.000Z");

function context(overrides: Partial<MappingContext> = {}): MappingContext {
  const data = seedDossierData(
    { index: 61, civility: "MME", firstName: "Łucja", lastName: "Ñúñez-O'Brien", minor: true },
    today,
    "complete",
    "00012345678A",
  );
  return {
    data,
    ulName: "Unité locale de Versailles",
    ulCity: "Versailles",
    signedAt,
    crf: { lastName: "Démo", firstName: "Maé", quality: "Responsable de l'intégration" },
    minor: true,
    ...overrides,
  };
}

describe("official templates", () => {
  it("match their frozen SHA-256", async () => {
    await expect(verifyTemplates()).resolves.toBeUndefined();
  });

  it("a modified template blocks the generation with a clear message", async () => {
    const bytes = await loadTemplate("charte");
    const modified = new Uint8Array(bytes);
    modified[modified.length - 10] = (modified[modified.length - 10] ?? 0) ^ 0xff;
    expect(sha256(modified)).not.toBe(TEMPLATES.charte.sha256);
    expect(() => assertIntact(modified, TEMPLATES.charte.sha256, "Charte du bénévolat")).toThrow(
      TemplateModifiedError,
    );
    expect(() => assertIntact(modified, TEMPLATES.charte.sha256, "Charte du bénévolat")).toThrow(
      /Charte du bénévolat.*génération des documents est bloquée/,
    );
  });
});

describe("mappings", () => {
  it.each(KEYS)("%s: every mapped field exists, and every field is mapped", async (key) => {
    const doc = await PDFDocument.load(await loadTemplate(key));
    const names = doc
      .getForm()
      .getFields()
      .map((f) => f.getName())
      .sort();
    const mapping = MAPPINGS[key](context());
    const covered = [
      ...Object.keys(mapping.fields),
      ...Object.keys(mapping.signatures),
      ...Object.keys(mapping.empty),
    ];
    expect(covered.filter((n) => !names.includes(n))).toEqual([]);
    expect(names.filter((n) => !covered.includes(n))).toEqual([]);
    expect(new Set(covered).size).toBe(covered.length);
    for (const o of mapping.widgetOverrides) expect(names).toContain(o.field);
  });

  it("check boxes are booleans, the rest is text", async () => {
    for (const key of KEYS) {
      const doc = await PDFDocument.load(await loadTemplate(key));
      const mapping = MAPPINGS[key](context());
      for (const field of doc.getForm().getFields()) {
        const value = mapping.fields[field.getName()];
        if (value === undefined) continue;
        expect(typeof value, `${key}: ${field.getName()}`).toBe(
          field instanceof PDFCheckBox ? "boolean" : "string",
        );
      }
    }
  });

  it("the dossier mapping uses the exact field names", () => {
    const { fields } = MAPPINGS.dossier(context());
    expect(fields["Prénom - 2"]).toBe("Łucja");
    expect(fields["Nom de naissance"]).toBe("Ñúñez-O'Brien");
    expect(fields["Civilité - Mme"]).toBe(true);
    expect(fields["Civilité - M"]).toBe(false);
    expect(fields["NIVOL - Oui"]).toBe(true);
    expect(fields.NIVOL).toBe("00012345678A");
    expect(fields["Jour signature"]).toBe("05");
    expect(fields["Compétence 1 - Confirmé"]).toBe(true);
    expect(fields["Langue 1 - Courant"]).toBe(true);
    expect(fields["Structure de rattachement"]).toBe("Unité locale de Versailles");
    // Declared diplomas (step 16): the label, then the year when known; empty boxes stay empty.
    expect(fields["Diplome 1"]).toBe("PSC (Prévention et secours civiques, ex-PSC1) (2019)");
    expect(fields["Diplome 2"]).toBe("");
  });

  it("the charte: volunteer left, Croix-Rouge right, parent below, emergency contact", () => {
    const { fields, signatures } = MAPPINGS.charte(context());
    expect(fields["Fait à"]).toBe("Versailles");
    expect(fields.Nom_2).toBe("Démo");
    expect(fields.Qualité).toBe("Responsable de l'intégration");
    expect(fields.Nom_3).toBe("Ñúñez-O'Brien");
    expect(fields["nom / qualité"]).toBe("Dominique Ñúñez-O'Brien / Mère");
    expect(signatures).toEqual({
      Signature: "VOLUNTEER",
      "Signature 01": "CRF_REPRESENTATIVE",
      "Signature parent": "PARENT",
    });
    expect(MAPPINGS.charte(context({ minor: false })).fields.Nom_3).toBe("");
  });

  it("the aptitude: NIVOL intentionally empty, signature date on the second date widgets", () => {
    const mapping = MAPPINGS.aptitude(context());
    expect(mapping.empty.NIVOL).toMatch(/étape 9/);
    expect(mapping.widgetOverrides.map((o) => o.value)).toEqual(["05", "11", "2026"]);
  });

  it("splits a long structure name over the two lines of the charte", () => {
    expect(splitStructure("Unité locale de Versailles")).toEqual(["Unité locale de", "Versailles"]);
    expect(splitStructure("UL Versailles")).toEqual(["UL Versailles", ""]);
  });
});

describe("text helpers", () => {
  it("splits dates in the Paris time zone", () => {
    expect(parisDateParts(new Date("2026-11-05T23:30:00Z"))).toEqual({
      jour: "06",
      mois: "11",
      annee: "2026",
    });
    expect(parisDateParts(new Date("2026-07-14T22:30:00Z")).jour).toBe("15");
    expect(parisDay(new Date("2026-03-29T00:30:00Z"))).toBe("29/03/2026");
    expect(isoDayParts("2011-09-21")).toEqual({ jour: "21", mois: "09", annee: "2011" });
    expect(isoDayParts(undefined)).toEqual({ jour: "", mois: "", annee: "" });
  });

  it("reduces the font size, then truncates cleanly, never overflowing", () => {
    const measure = (t: string, size: number) => t.length * size * 0.5;
    expect(fitText("court", measure, { width: 100, maxSize: 9, minSize: 6 })).toEqual({
      text: "court",
      size: 9,
      truncated: false,
    });
    const reduced = fitText("x".repeat(30), measure, { width: 100, maxSize: 9, minSize: 6 });
    expect(reduced.size).toBeLessThan(9);
    expect(reduced.truncated).toBe(false);
    const cut = fitText("y".repeat(80), measure, { width: 100, maxSize: 9, minSize: 6 });
    expect(cut).toMatchObject({ size: 6, truncated: true });
    expect(cut.text.endsWith("…")).toBe(true);
    expect(measure(cut.text, 6)).toBeLessThanOrEqual(100);
  });
});

describe("rendering", () => {
  it.each(KEYS)(
    "%s: flattened, no field left, Unicode names kept, long values fitted",
    async (key) => {
      const ctx = context();
      ctx.data.contact = {
        ...ctx.data.contact,
        street: `${"Résidence des Tilleuls, bâtiment B, escalier 4, ".repeat(4)}fin`,
      };
      const png = new Uint8Array(fakeSignature());
      const bytes = await renderTemplate({
        template: await loadTemplate(key),
        font: await loadFont(),
        mapping: MAPPINGS[key](ctx),
        images: {
          VOLUNTEER: { png, signedAt },
          PARENT: { png, signedAt },
          CRF_REPRESENTATIVE: { png, signedAt },
        },
        title: TEMPLATES[key].label,
        producedAt: signedAt,
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getForm().getFields()).toHaveLength(0);
      const text = await pdfText(bytes);
      expect(text).toContain("Łucja");
      expect(text).toContain("Ñúñez-O'Brien");
      expect(text).toContain("Signé électroniquement le 05/11/2026");
      if (key === "dossier") expect(text).toMatch(/Résidence des Tilleuls.*…/);
    },
    30_000,
  );

  it("a preview is marked and carries no signature", async () => {
    const bytes = await renderTemplate({
      template: await loadTemplate("charte"),
      font: await loadFont(),
      mapping: MAPPINGS.charte(context({ signedAt: null, crf: null })),
      images: {},
      title: "Aperçu",
      producedAt: signedAt,
      preview: true,
    });
    const text = await pdfText(bytes);
    expect(text).toContain("APERÇU, NON SIGNÉ");
    expect(text).not.toContain("Signé électroniquement");
  }, 30_000);
});
