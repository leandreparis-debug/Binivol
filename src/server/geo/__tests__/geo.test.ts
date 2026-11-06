// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fromBan } from "@/server/geo/address";
import { communesOf, parsePostalFile, postalCodesOf } from "@/server/geo/postalCodes";

const sample = parsePostalFile(
  [
    "78000;VERSAILLES;78646",
    "78120;CLAIREFONTAINE EN YVELINES;78164",
    "78120;RAMBOUILLET;78517",
    "78210;ST CYR L ECOLE;78545",
    "20000;AJACCIO;2A004",
    "97400;ST DENIS;97411",
  ].join("\n"),
);

describe("local postal codes", () => {
  it("a postal code gives its communes, several when shared", () => {
    expect(communesOf("78000", sample).map((s) => s.city)).toEqual(["Versailles"]);
    expect(communesOf("78 120", sample).map((s) => s.city)).toEqual([
      "Clairefontaine en Yvelines",
      "Rambouillet",
    ]);
    expect(communesOf("20000", sample)[0]).toMatchObject({ postalCode: "20000", city: "Ajaccio" });
    expect(communesOf("97400", sample)[0]?.city).toBe("St Denis");
    expect(communesOf("7812", sample)).toEqual([]);
  });

  it("a city gives its postal codes, accents and « Saint » ignored", () => {
    expect(postalCodesOf("versailles", sample).map((s) => s.postalCode)).toEqual(["78000"]);
    expect(postalCodesOf("Saint-Cyr-l'École", sample).map((s) => s.postalCode)).toEqual(["78210"]);
    expect(postalCodesOf("Ramb", sample).map((s) => s.city)).toEqual(["Rambouillet"]);
  });

  it("the real file holds Versailles, Rambouillet and both Corsicas", async () => {
    const real = parsePostalFile(
      (await import("node:fs")).readFileSync("src/server/geo/postal-codes.txt", "utf8"),
    );
    expect(real.length).toBeGreaterThan(30_000);
    expect(communesOf("78000", real).map((s) => s.city)).toContain("Versailles");
    expect(communesOf("78120", real).map((s) => s.city)).toContain("Rambouillet");
    expect(real.some((r) => r.insee.startsWith("2A"))).toBe(true);
    expect(real.some((r) => r.insee.startsWith("2B"))).toBe(true);
  });
});

describe("Base Adresse Nationale answer", () => {
  it("keeps number and street, postal code and city; skips incomplete features", () => {
    const body = {
      features: [
        {
          properties: {
            label: "10 Rue de la Paroisse 78000 Versailles",
            name: "10 Rue de la Paroisse",
            postcode: "78000",
            city: "Versailles",
            type: "housenumber",
          },
        },
        {
          properties: {
            label: "Versailles",
            name: "Versailles",
            postcode: "78000",
            city: "Versailles",
            type: "municipality",
          },
        },
        { properties: { name: "sans code postal" } },
      ],
    };
    expect(fromBan(body)).toEqual([
      {
        label: "10 Rue de la Paroisse 78000 Versailles",
        street: "10 Rue de la Paroisse",
        postalCode: "78000",
        city: "Versailles",
        country: "France",
      },
      {
        label: "Versailles",
        street: "",
        postalCode: "78000",
        city: "Versailles",
        country: "France",
      },
    ]);
    expect(fromBan(null)).toEqual([]);
    expect(fromBan({ features: "x" })).toEqual([]);
  });
});
