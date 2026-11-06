import { describe, expect, it } from "vitest";
import { csvCell, csvFileName, toCsv } from "../csv";
import { matrixCell } from "../matrix";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("CSV for Excel in French", () => {
  it("BOM, `;`, CRLF and French dates", () => {
    const csv = toCsv(
      [{ n: "Alix", at: d("2026-03-05"), ok: true }],
      [
        { header: "Nom", value: (r) => r.n },
        { header: "Date", value: (r) => r.at },
        { header: "Actif", value: (r) => r.ok },
      ],
    );
    expect(csv).toBe("﻿Nom;Date;Actif\r\nAlix;05/03/2026;Oui\r\n");
  });

  it("escapes quotes, separators and line breaks", () => {
    expect(csvCell('Le "chef"')).toBe('"Le ""chef"""');
    expect(csvCell("a;b")).toBe('"a;b"');
    expect(csvCell("ligne 1\nligne 2")).toBe('"ligne 1\nligne 2"');
    expect(csvCell(null)).toBe("");
  });

  it("neutralises formulas (=, +, -, @)", () => {
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("+33 6")).toBe("'+33 6");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@cmd")).toBe("'@cmd");
    expect(csvCell('=HYPERLINK("x";"y")')).toBe(`"'=HYPERLINK(""x"";""y"")"`);
    expect(csvCell("Alix")).toBe("Alix");
  });

  it("dated file name", () => {
    expect(csvFileName("prefecture", d("2026-11-06"))).toBe("binivol-prefecture-2026-11-06.csv");
  });
});

describe("matrix cells", () => {
  it("symbol and full accessible label for each state", () => {
    expect(matrixCell({ status: "VALID", expiresAt: d("2027-12-31") }, "PSE")).toEqual({
      symbol: "✔",
      label: "PSE : valide jusqu'au 31/12/2027",
      tone: "ok",
    });
    expect(matrixCell({ status: "VALID_UNDATED", expiresAt: null }, "PSE").symbol).toBe("✔?");
    expect(matrixCell({ status: "EXPIRING", expiresAt: d("2026-12-31") }, "PSE")).toMatchObject({
      symbol: "Exp. 31/12",
      label: "PSE : expire le 31/12/2026",
    });
    expect(matrixCell({ status: "EXPIRED", expiresAt: d("2025-12-31") }, "PSE").symbol).toBe(
      "Expirée",
    );
    expect(
      matrixCell({ status: "REGISTERED", expiresAt: null, registeredAt: d("2026-12-12") }, "TCAU"),
    ).toMatchObject({ symbol: "Inscrit(e) 12/12", label: "TCAU : inscrit(e) le 12/12/2026" });
    expect(matrixCell({ status: "NONE", expiresAt: null }, "PSE")).toEqual({
      symbol: "",
      label: "PSE : aucune",
      tone: "none",
    });
  });
});
