import { describe, expect, it } from "vitest";
import { matrixCellSchema, recordUpdateSchema } from "@/lib/trainingForms";
import { MATRIX_TONE, matrixCell } from "@/lib/matrix";

describe("recordUpdateSchema (a line edited from the matrix)", () => {
  it("parses a result and a calendar day", () => {
    expect(recordUpdateSchema.parse({ id: "r1", result: "PASSED", date: "2026-10-01" })).toEqual({
      id: "r1",
      result: "PASSED",
      date: new Date("2026-10-01T00:00:00.000Z"),
    });
  });

  it("keeps the date when the field is left empty", () => {
    expect(recordUpdateSchema.parse({ id: "r1", result: "FAILED", date: "" }).date).toBeNull();
  });

  it("refuses an unknown result and a malformed date", () => {
    expect(recordUpdateSchema.safeParse({ id: "r1", result: "CANCELLED" }).success).toBe(false);
    expect(
      recordUpdateSchema.safeParse({ id: "r1", result: "PASSED", date: "01/10/2026" }).success,
    ).toBe(false);
  });
});

describe("matrixCellSchema", () => {
  it("requires a person and a training", () => {
    expect(matrixCellSchema.safeParse({ personId: "p", referenceId: "t" }).success).toBe(true);
    expect(matrixCellSchema.safeParse({ personId: "", referenceId: "t" }).success).toBe(false);
  });
});

describe("matrix tones", () => {
  it("has classes for every tone a cell can take", () => {
    const tone = matrixCell({ status: "EXPIRED", expiresAt: null }, "PSE").tone;
    expect(MATRIX_TONE[tone]).toContain("danger");
  });
});
