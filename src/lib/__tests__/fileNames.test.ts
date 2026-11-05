import { describe, expect, it } from "vitest";
import { capitalizeFirstName, contentDisposition, documentFileName } from "@/lib/fileNames";

describe("document file names", () => {
  it("NOM in capitals, Prénom capitalised, accents kept", () => {
    expect(documentFileName("Ñúñez-O'Brien", "łucja", "Dossier-Bénévole")).toBe(
      "ÑÚÑEZ-O'BRIEN_Łucja_Dossier-Bénévole.pdf",
    );
    expect(documentFileName("de la Fontaine", "jean pierre", "Charte-du-Bénévolat")).toBe(
      "DE-LA-FONTAINE_Jean-Pierre_Charte-du-Bénévolat.pdf",
    );
    expect(documentFileName("Exemple", "MARIE-ÈVE", "Attestation-d_Aptitude")).toBe(
      "EXEMPLE_Marie-Ève_Attestation-d_Aptitude.pdf",
    );
  });

  it("removes forbidden characters and collapses spaces", () => {
    expect(documentFileName(' Dupont / "Durand" ', "a:b*c?", "Dossier-Bénévole")).toBe(
      "DUPONT-DURAND_Abc_Dossier-Bénévole.pdf",
    );
    expect(documentFileName("", "", "Charte-du-Bénévolat")).toBe(
      "NOM_Prénom_Charte-du-Bénévolat.pdf",
    );
  });

  it("capitalises each part of a compound first name", () => {
    expect(capitalizeFirstName("anne-sophie")).toBe("Anne-Sophie");
    expect(capitalizeFirstName("o'neil")).toBe("O'Neil");
  });
});

describe("Content-Disposition", () => {
  it("gives an ASCII fallback and the exact name in filename* (RFC 5987)", () => {
    expect(contentDisposition("ÑÚÑEZ-O'BRIEN_Łucja_Dossier-Bénévole.pdf")).toBe(
      "attachment; filename=\"NUNEZ-O'BRIEN__ucja_Dossier-Benevole.pdf\"; filename*=UTF-8''%C3%91%C3%9A%C3%91EZ-O%27BRIEN_%C5%81ucja_Dossier-B%C3%A9n%C3%A9vole.pdf",
    );
    expect(contentDisposition('a"b.pdf', "inline")).toMatch(/^inline; filename="a_b.pdf"/);
  });
});
