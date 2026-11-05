import { describe, expect, it } from "vitest";
import {
  canUndoFinalize,
  DEFAULT_GAIA_CHECKLIST,
  gaiaCopyText,
  gaiaRows,
  parseCheckedStates,
  parseGaiaChecklist,
  type GaiaSource,
} from "../gaia";

const source: GaiaSource = {
  civility: "MME",
  lastName: "Exemple",
  birthName: null,
  usageName: "Fictive",
  firstName: "Łucja",
  phone: "0639980001",
  email: "lucja@exemple.test",
  birthDate: new Date("2001-03-04T00:00:00.000Z"),
  birthCity: "Versailles",
  birthDepartment: "78",
  birthCountry: "France",
  street: "1 rue des Exemples",
  addressComplement: null,
  postalCode: "78000",
  city: "Versailles",
  country: "France",
  emergency: { firstName: "Paul", lastName: "Exemple", relationship: "Frère", phone: "0639980002" },
};

describe("Gaia sheet", () => {
  it("follows the order of Gaia's creation screen, dates as JJ/MM/AAAA", () => {
    const rows = gaiaRows(source);
    expect(rows.map((r) => r.label)).toEqual([
      "Civilité",
      "Nom de naissance",
      "Nom d'usage",
      "Prénom",
      "Date de naissance",
      "Lieu de naissance",
      "Pays de naissance",
      "Nationalité",
      "Adresse",
      "Complément d'adresse",
      "Code postal",
      "Ville",
      "Pays",
      "Téléphone",
      "E-mail",
      "Contact d'urgence",
      "Lien avec le contact",
      "Téléphone du contact",
    ]);
    const value = (key: string) => rows.find((r) => r.key === key)?.value;
    expect(value("civility")).toBe("Madame");
    expect(value("birthName")).toBe("Exemple"); // the name when no birth name
    expect(value("birthDate")).toBe("04/03/2001");
    expect(value("birthPlace")).toBe("Versailles (78)");
    expect(value("phone")).toBe("06 39 98 00 01");
    expect(value("emergencyName")).toBe("Paul Exemple");
    expect(value("nationality")).toBe("");
  });

  it("« Tout copier » is tab-separated, one field per line, in the same order", () => {
    const text = gaiaCopyText(gaiaRows(source));
    const lines = text.split("\n");
    expect(lines).toHaveLength(18);
    expect(lines[0]).toBe("Civilité\tMadame");
    expect(lines[3]).toBe("Prénom\tŁucja");
    expect(lines[17]).toBe("Téléphone du contact\t06 39 98 00 02");
  });
});

describe("Gaia checklist", () => {
  it("reads the setting, falling back to the default list", () => {
    expect(parseGaiaChecklist(null)).toEqual(DEFAULT_GAIA_CHECKLIST);
    expect(parseGaiaChecklist([{ key: "x y", label: "Bad key" }])).toEqual(DEFAULT_GAIA_CHECKLIST);
    expect(parseGaiaChecklist([{ key: "one", label: " Un " }])).toEqual([
      { key: "one", label: "Un" },
    ]);
    expect(DEFAULT_GAIA_CHECKLIST.map((i) => i.label)).toEqual([
      "Personne créée dans Gaia",
      "Adhésion enregistrée",
      "Rattachement à l'UL de Versailles",
      "Compte @croix-rouge.fr demandé",
    ]);
  });

  it("reads the checked states, ignoring garbage", () => {
    expect(
      parseCheckedStates({
        created: { at: "2026-11-06T10:00:00.000Z", byId: "u1", by: "Maé Démo" },
        bad: 3,
      }),
    ).toEqual({ created: { at: "2026-11-06T10:00:00.000Z", byId: "u1", by: "Maé Démo" } });
    expect(parseCheckedStates([])).toEqual({});
  });
});

describe("undo of a closure", () => {
  it("is possible within 7 days only", () => {
    const closed = new Date("2026-11-01T10:00:00.000Z");
    expect(canUndoFinalize(closed, new Date("2026-11-08T10:00:00.000Z"))).toBe(true);
    expect(canUndoFinalize(closed, new Date("2026-11-08T10:00:01.000Z"))).toBe(false);
    expect(canUndoFinalize(null)).toBe(false);
  });
});
