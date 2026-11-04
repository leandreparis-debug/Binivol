import { createHash } from "node:crypto";

/** Maximum size of an uploaded workbook. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
/** OLE compound file: legacy .xls, or an encrypted (password-protected) .xlsx. */
const OLE_SIGNATURE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

export type FileCheck = { ok: true } | { ok: false; message: string };

/**
 * Checks that the bytes are a real .xlsx: size, ZIP signature and a
 * `xl/workbook.xml` entry (file names are stored in clear in ZIP headers).
 * The extension alone is never trusted.
 */
export function checkXlsxFile(buffer: Buffer): FileCheck {
  if (buffer.length === 0) return { ok: false, message: "Le fichier est vide." };
  if (buffer.length > MAX_IMPORT_BYTES) {
    return { ok: false, message: "Le fichier dépasse la taille maximale de 5 Mo." };
  }
  if (buffer.subarray(0, 8).equals(OLE_SIGNATURE)) {
    return {
      ok: false,
      message:
        "Le fichier est protégé par mot de passe (ou au format .xls ancien). Exportez le classeur en .xlsx sans mot de passe.",
    };
  }
  if (!buffer.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    return { ok: false, message: "Ce fichier n'est pas un classeur .xlsx." };
  }
  if (!buffer.includes("xl/workbook.xml")) {
    return {
      ok: false,
      message: "Ce fichier n'est pas un classeur .xlsx (xl/workbook.xml absent).",
    };
  }
  return { ok: true };
}

export function sha256Hex(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
