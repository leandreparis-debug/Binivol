// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkXlsxFile, MAX_IMPORT_BYTES, sha256Hex } from "@/server/import/file";

const fixture = readFileSync("tests/fixtures/classeur-v03-fictif.xlsx");

describe("checkXlsxFile", () => {
  it("accepts the synthetic workbook", () => {
    expect(checkXlsxFile(fixture)).toEqual({ ok: true });
  });

  it("rejects a renamed text file", () => {
    expect(checkXlsxFile(Buffer.from("NIVOL;Nom\n00012345678A;Fictif"))).toMatchObject({
      ok: false,
      message: "Ce fichier n'est pas un classeur .xlsx.",
    });
  });

  it("rejects a ZIP that is not a workbook", () => {
    const zip = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.from("word/document.xml"),
    ]);
    expect(checkXlsxFile(zip)).toMatchObject({
      ok: false,
      message: expect.stringContaining("xl/workbook.xml") as string,
    });
  });

  it("explains a password-protected (encrypted) workbook", () => {
    const ole = Buffer.concat([
      Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
      Buffer.alloc(64),
    ]);
    expect(checkXlsxFile(ole)).toMatchObject({
      ok: false,
      message: expect.stringContaining("mot de passe") as string,
    });
  });

  it("rejects an empty or too large file", () => {
    expect(checkXlsxFile(Buffer.alloc(0)).ok).toBe(false);
    expect(checkXlsxFile(Buffer.alloc(MAX_IMPORT_BYTES + 1))).toMatchObject({
      ok: false,
      message: expect.stringContaining("5 Mo") as string,
    });
  });

  it("fingerprints the bytes", () => {
    expect(sha256Hex(fixture)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex(Buffer.from("a"))).toBe(
      "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
    );
  });
});
