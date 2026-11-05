// @vitest-environment node
import { mkdtemp, writeFile, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import type { DossierDraft } from "@/lib/dossierSchema";
import { pdfText, signaturePng } from "@/test/pdf/helpers";
import { fillTemplate, templateFields } from "../fill";
import { contentDisposition, officialFileName } from "../fileName";
import {
  INTENTIONALLY_EMPTY,
  MAPPINGS,
  SECOND_WIDGET_DATES,
  SIGNATURE_FIELDS,
  STRUCTURE_SPLIT,
  type PdfInput,
} from "../mappings";
import { buildProofPdf, wrap } from "../proof";
import {
  assetsDir,
  checkAssets,
  readAsset,
  sha256,
  TemplateIntegrityError,
  TEMPLATES,
  type TemplateKind,
} from "../templates";
import { fitText, isoDayParts, parisDateParts, parisDayText, splitOverTwo } from "../text";

const KINDS: TemplateKind[] = ["DOSSIER", "CHARTE", "APTITUDE"];

const data: DossierDraft = {
  identity: {
    civility: "MME",
    lastName: "Ñúñez-O'Brien",
    firstName: "Łucja",
    secondFirstName: "Zoë",
    birthDate: "2009-03-04",
    birthCity: "Kraków",
    birthCountry: "Pologne",
  },
  contact: {
    street: "1 rue des Exemples",
    postalCode: "78000",
    city: "Versailles",
    country: "France",
    phone: "0639980001",
    email: "lucja.exemple@exemple.test",
  },
  crf: { alreadyVolunteer: false, hasNivol: false, hasCrfEmail: false, activities: ["Logistique"] },
  emergency: {
    civility: "M",
    lastName: "Exemple",
    firstName: "Jérôme",
    relationship: "Père",
    phone1: "0639980002",
  },
  profile: {
    skills: [{ label: "Informatique", level: "EXPERT" }],
    languages: [{ label: "Polonais", level: "BILINGUAL" }],
    diplomas: ["PSC1"],
    licenses: [],
    profession: "Lycéenne",
  },
  guardian: {
    lastName: "Ñúñez",
    firstName: "Dominika",
    quality: "Mère",
    phone: "0639980003",
    email: "dominika.exemple@exemple.test",
  },
  structure: "Unité locale de Versailles",
};

const input: PdfInput = {
  data,
  structure: "Unité locale de Versailles",
  city: "Versailles",
  signedOn: new Date("2026-11-05T23:30:00Z"),
  representative: { lastName: "Fictif", firstName: "Camille", quality: "DIAMANT" },
  nivol: null,
};
const signature = { png: signaturePng(), signedAt: new Date("2026-11-05T23:30:00Z") };

describe("official file names", () => {
  it("NOM in capitals, Prénom capitalised, accents kept, spaces to dashes", () => {
    expect(officialFileName("Dupont", "jean éric", "DOSSIER")).toBe(
      "DUPONT_Jean-Éric_Dossier-Bénévole.pdf",
    );
    expect(officialFileName("de la Fontaine", "ANNE", "CHARTE")).toBe(
      "DE-LA-FONTAINE_Anne_Charte-du-Bénévolat.pdf",
    );
    expect(officialFileName("Ñúñez-O'Brien", "łucja", "APTITUDE")).toBe(
      "ÑÚÑEZ-O'BRIEN_Łucja_Attestation-d_Aptitude.pdf",
    );
  });

  it("removes forbidden characters and never leaves an empty part", () => {
    expect(officialFileName('a/b\\c:d*e?"f<g>h|i_j', "k\u0007l", "DOSSIER")).toBe(
      "ABCDEFGHIJ_Kl_Dossier-Bénévole.pdf",
    );
    expect(officialFileName("  ", "", "PROOF")).toBe("NOM_Prénom_Preuve-de-signature.pdf");
  });

  it("Content-Disposition carries an ASCII fallback and the exact name (RFC 5987)", () => {
    const header = contentDisposition("ÑÚÑEZ_Łucja_Charte-du-Bénévolat.pdf");
    expect(header).toBe(
      "attachment; filename=\"NUNEZ__ucja_Charte-du-Benevolat.pdf\"; filename*=UTF-8''%C3%91%C3%9A%C3%91EZ_%C5%81ucja_Charte-du-B%C3%A9n%C3%A9volat.pdf",
    );
    expect(contentDisposition("O'Brien (1).pdf")).toContain(
      "filename*=UTF-8''O%27Brien%20%281%29.pdf",
    );
  });
});

describe("dates and text fitting", () => {
  it("splits an instant in Paris: 23:30 UTC on 31/12 is already 01/01 in Paris", () => {
    expect(parisDateParts(new Date("2026-12-31T23:30:00Z"))).toEqual({
      day: "01",
      month: "01",
      year: "2027",
    });
    expect(parisDateParts(new Date("2026-07-14T21:59:00Z"))).toEqual({
      day: "14",
      month: "07",
      year: "2026",
    });
    expect(parisDayText(new Date("2026-03-29T00:30:00Z"))).toBe("29/03/2026");
    expect(isoDayParts("2009-03-04")).toEqual({ day: "04", month: "03", year: "2009" });
    expect(isoDayParts("04/03/2009")).toBeNull();
  });

  const measure = (t: string, size: number) => t.length * size * 0.5;

  it("keeps the size when it fits, reduces it, then cuts with « … »", () => {
    expect(fitText("Court", 100, measure)).toEqual({ text: "Court", size: 9, truncated: false });
    const reduced = fitText("x".repeat(25), 100, measure);
    expect(reduced.size).toBeLessThan(9);
    expect(reduced.size).toBeGreaterThanOrEqual(6);
    expect(measure(reduced.text, reduced.size)).toBeLessThanOrEqual(100);
    const cut = fitText("y".repeat(200), 100, measure);
    expect(cut.truncated).toBe(true);
    expect(cut.text.endsWith("…")).toBe(true);
    expect(measure(cut.text, cut.size)).toBeLessThanOrEqual(100);
  });

  it("splits a long structure over two fields by whole words", () => {
    expect(splitOverTwo("Unité locale de Versailles", 60, measure, 9)).toEqual([
      "Unité locale",
      "de Versailles",
    ]);
    expect(splitOverTwo("Court", 60, measure, 9)).toEqual(["Court", ""]);
  });

  it("wraps the proof text without losing characters", () => {
    const lines = wrap("a".repeat(30) + " bb cc", 10, (t) => t.length);
    expect(lines.join("")).toBe("a".repeat(30) + "bb cc");
    expect(lines.every((l) => l.length <= 10)).toBe(true);
  });
});

describe("templates", () => {
  it("each template has its frozen SHA-256", async () => {
    expect(await checkAssets()).toEqual([]);
    for (const kind of KINDS) {
      expect(sha256(await readAsset(TEMPLATES[kind]))).toBe(TEMPLATES[kind].sha256);
    }
  });

  it("a modified template blocks the generation with a clear message", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "binivol-assets-"));
    await cp(assetsDir(), dir, { recursive: true });
    await writeFile(path.join(dir, TEMPLATES.CHARTE.file), Buffer.from("%PDF-1.7 modifié"));
    await expect(readAsset(TEMPLATES.CHARTE, dir)).rejects.toBeInstanceOf(TemplateIntegrityError);
    await expect(readAsset(TEMPLATES.CHARTE, dir)).rejects.toThrow(
      /« NOM_Prénom_Charte-du-Bénévolat\.pdf » a été modifié/,
    );
    expect(await checkAssets(dir)).toEqual([TEMPLATES.CHARTE.file]);
  });

  it.each(KINDS)("mapping of %s: every field exists, no field forgotten", async (kind) => {
    const fields = await templateFields(kind);
    const names = new Set(fields.map((f) => f.name));
    const mapped = Object.keys(MAPPINGS[kind]);
    const signatures = Object.values(SIGNATURE_FIELDS[kind]);
    const split = kind === "CHARTE" ? [...STRUCTURE_SPLIT] : [];
    for (const name of [
      ...mapped,
      ...signatures,
      ...split,
      ...Object.keys(INTENTIONALLY_EMPTY[kind]),
    ]) {
      expect(names.has(name), `${kind} : champ « ${name} » absent du modèle`).toBe(true);
    }
    const covered = new Set([
      ...mapped,
      ...signatures,
      ...split,
      ...Object.keys(INTENTIONALLY_EMPTY[kind]),
    ]);
    expect([...names].filter((n) => !covered.has(n))).toEqual([]);
    // Check boxes get booleans, text fields strings.
    for (const field of fields) {
      const get = MAPPINGS[kind][field.name];
      if (!get) continue;
      expect(typeof get(input), `${kind} : ${field.name}`).toBe(
        field.type === "checkbox" ? "boolean" : "string",
      );
    }
  });

  it("knows the exact number of fields of each template", async () => {
    expect((await templateFields("DOSSIER")).length).toBe(89);
    expect((await templateFields("CHARTE")).length).toBe(18);
    expect((await templateFields("APTITUDE")).length).toBe(8);
    expect(Object.keys(SECOND_WIDGET_DATES)).toHaveLength(3);
  });
});

describe("filling", () => {
  it.each(KINDS)(
    "%s: flattened (no field), Unicode names rendered, signature date",
    async (kind) => {
      const bytes = await fillTemplate(kind, input, {
        VOLUNTEER: signature,
        PARENT: signature,
        CRF_REPRESENTATIVE: signature,
      });
      const doc = await PDFDocument.load(bytes);
      expect(doc.getForm().getFields()).toHaveLength(0);
      const text = (await pdfText(bytes)).join("\n");
      expect(text).toContain("Łucja");
      expect(text).toContain("Ñúñez-O'Brien");
      expect(text).toContain("Signé électroniquement le 06/11/2026");
    },
  );

  it("charter: volunteer, representative, guardian and person to notify in their places", async () => {
    const bytes = await fillTemplate("CHARTE", input, { VOLUNTEER: signature });
    const page3 = (await pdfText(bytes))[2] ?? "";
    for (const value of [
      "Versailles",
      "Camille",
      "Fictif",
      "DIAMANT",
      "Dominika",
      "Jérôme Exemple / Père",
      "06 39 98 00 02",
    ]) {
      expect(page3).toContain(value);
    }
  });

  it("an adult's charter leaves the guardian block empty", async () => {
    const adult = { ...input, data: { ...data, guardian: {} } };
    const page3 = (await pdfText(await fillTemplate("CHARTE", adult)))[2] ?? "";
    expect(page3).not.toContain("Dominika");
  });

  it("aptitude: NIVOL empty at step 8, the « Date » line gets the signature date", async () => {
    const bytes = await fillTemplate("APTITUDE", input, { VOLUNTEER: signature });
    const page1 = (await pdfText(bytes))[0] ?? "";
    expect(page1).toContain("Kraków, Pologne");
    expect(page1).toContain("2009");
    expect(page1).toContain("2026");
    const withNivol = (
      await pdfText(await fillTemplate("APTITUDE", { ...input, nivol: "00012345678A" }))
    )[0];
    expect(withNivol).toContain("00012345678A");
    expect(page1).not.toContain("00012345678A");
  });

  it("a value too long for its field is reduced or cut, never overflowing", async () => {
    const long = {
      ...input,
      data: { ...data, contact: { ...data.contact, street: "Rue ".repeat(60) + "Fin" } },
    };
    const text = (await pdfText(await fillTemplate("DOSSIER", long))).join(" ");
    expect(text).toContain("…");
    expect(text).not.toContain("Fin");
  });

  it("a preview is marked and has no signature", async () => {
    const bytes = await fillTemplate(
      "DOSSIER",
      { ...input, signedOn: null },
      {},
      { preview: true },
    );
    const text = (await pdfText(bytes)).join(" ");
    expect(text).toContain("Aperçu avant signature");
    expect(text).not.toContain("Signé électroniquement");
  });
});

describe("proof of signature", () => {
  it("one page with the signers, their method and the documents' hashes", async () => {
    const bytes = await buildProofPdf({
      structure: "Unité locale de Versailles",
      personRef: "P-00099",
      personName: "Łucja ÑÚÑEZ",
      generatedAt: new Date("2026-11-06T10:00:00Z"),
      signers: [
        {
          role: "Bénévole",
          name: "Łucja Ñúñez",
          quality: null,
          signedAt: new Date("2026-11-05T23:30:00Z"),
          method: "Code reçu par e-mail",
          verification: "e-mail vérifié : lucja.exemple@exemple.test",
          input: "Tracé",
          userAgent: "Mozilla/5.0 (fictif)",
          ipHash: "a".repeat(64),
        },
      ],
      files: [{ fileName: "ÑÚÑEZ_Łucja_Dossier-Bénévole.pdf", sha256: "b".repeat(64) }],
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const text = (await pdfText(bytes))[0] ?? "";
    expect(text).toContain("Preuve de signature électronique");
    expect(text).toContain("Code reçu par e-mail");
    expect(text).toContain("b".repeat(64));
    expect(text).toContain("eIDAS");
  });
});
