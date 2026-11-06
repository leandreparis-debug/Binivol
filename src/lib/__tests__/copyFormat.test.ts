import { describe, expect, it } from "vitest";
import {
  addressOneLine,
  copyEntries,
  DEFAULT_COPY_PREFS,
  phoneForCopy,
  tabulated,
  valueForCopy,
} from "@/lib/copyFormat";

describe("copy formats", () => {
  it("phones: +33 6 12 34 56 78, or without spaces", () => {
    expect(phoneForCopy("06 12 34 56 78", "international")).toBe("+33 6 12 34 56 78");
    expect(phoneForCopy("06 12 34 56 78", "compact")).toBe("0612345678");
    expect(phoneForCopy("+33612345678", "compact")).toBe("0612345678");
    expect(phoneForCopy("+44 20 7946 0000", "international")).toBe("+44 20 7946 0000");
    expect(phoneForCopy("+44 20 7946 0000", "compact")).toBe("+442079460000");
  });

  it("names in capitals, the rest as shown (dates are JJ/MM/AAAA already)", () => {
    expect(valueForCopy("lastName", "Ñúñez-O'Brien", DEFAULT_COPY_PREFS)).toBe("ÑÚÑEZ-O'BRIEN");
    expect(valueForCopy("emergency.lastName", "Exemple", DEFAULT_COPY_PREFS)).toBe("EXEMPLE");
    expect(valueForCopy("firstName", "Léa", DEFAULT_COPY_PREFS)).toBe("Léa");
    expect(valueForCopy("birthDate", "04/05/1990", DEFAULT_COPY_PREFS)).toBe("04/05/1990");
    expect(valueForCopy("emergency.phone1", "06 39 98 00 02", DEFAULT_COPY_PREFS)).toBe(
      "+33 6 39 98 00 02",
    );
  });

  it("tabulated lines, « Champ<TAB>Valeur »", () => {
    expect(
      tabulated([
        { label: "Nom", text: "MARTIN" },
        { label: "Ville", text: "Versailles" },
      ]),
    ).toBe("Nom\tMARTIN\nVille\tVersailles");
  });

  it("the address in one line or field by field", () => {
    const rows = [
      { key: "lastName", label: "Nom", value: "Martin" },
      { key: "street", label: "Numéro et voie", value: "10 rue des Essais" },
      { key: "addressComplement", label: "Complément", value: null },
      { key: "postalCode", label: "Code postal", value: "78000" },
      { key: "city", label: "Ville", value: "Versailles" },
      { key: "country", label: "Pays", value: "France" },
      { key: "phone", label: "Téléphone", value: "06 12 34 56 78" },
    ];
    expect(copyEntries(rows, { phone: "compact", address: "oneLine" })).toEqual([
      { label: "Nom", text: "MARTIN" },
      { label: "Adresse", text: "10 rue des Essais, 78000 Versailles, France" },
      { label: "Téléphone", text: "0612345678" },
    ]);
    expect(copyEntries(rows, DEFAULT_COPY_PREFS).map((e) => e.label)).toEqual([
      "Nom",
      "Numéro et voie",
      "Code postal",
      "Ville",
      "Pays",
      "Téléphone",
    ]);
    expect(addressOneLine({ "emergency.city": "Paris" }, "emergency.")).toBe("Paris");
  });
});
