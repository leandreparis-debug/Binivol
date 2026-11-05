import { describe, expect, it } from "vitest";
import {
  checkDocumentFile,
  cleanFileName,
  detectDocumentType,
  MAX_DOCUMENT_BYTES,
} from "../documentFile";

const PDF = Buffer.from("%PDF-1.7\n%fictif\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const EXE = Buffer.from("MZ\x90\x00 fictif exécutable");

describe("document signatures", () => {
  it("detects PDF, JPEG and PNG by their first bytes", () => {
    expect(detectDocumentType(PDF)?.mimeType).toBe("application/pdf");
    expect(detectDocumentType(JPEG)?.mimeType).toBe("image/jpeg");
    expect(detectDocumentType(PNG)?.mimeType).toBe("image/png");
  });

  it("refuses an .exe renamed .pdf: the name is never trusted", () => {
    expect(detectDocumentType(EXE)).toBeNull();
    expect(() => checkDocumentFile(EXE)).toThrow(/Seuls les fichiers PDF, JPEG et PNG/);
  });

  it("refuses an empty file and a file over 10 Mo with a clear message", () => {
    expect(() => checkDocumentFile(Buffer.alloc(0))).toThrow(/vide/);
    const big = Buffer.alloc(11 * 1024 * 1024);
    PDF.copy(big);
    expect(() => checkDocumentFile(big)).toThrow("Le fichier dépasse 10 Mo (11,0 Mo).");
    const limit = Buffer.alloc(MAX_DOCUMENT_BYTES);
    PDF.copy(limit);
    expect(checkDocumentFile(limit).extension).toBe("pdf");
  });
});

describe("cleanFileName", () => {
  const pdf = { mimeType: "application/pdf", extension: "pdf" } as const;
  it("drops folders and odd characters, keeps the detected extension", () => {
    expect(cleanFileName("C:\\Users\\x\\Attestation PSE été.PDF", pdf)).toBe(
      "Attestation PSE ete.pdf",
    );
    expect(cleanFileName("../../etc/passwd", pdf)).toBe("passwd.pdf");
    expect(cleanFileName("photo.exe", pdf)).toBe("photo.pdf");
    expect(cleanFileName("<script>.pdf", pdf)).toBe("script.pdf");
    expect(cleanFileName("", pdf)).toBe("document.pdf");
  });
});
