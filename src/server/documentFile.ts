import { createHash } from "node:crypto";
import { DomainError } from "./errors";

/**
 * Checks of an uploaded document. The type comes from the **binary
 * signature** of the file, never from its name or the browser's MIME type:
 * a `.exe` renamed `.pdf` is refused.
 */

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export interface DocumentType {
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  extension: "pdf" | "jpg" | "png";
}

const SIGNATURES: { bytes: number[]; type: DocumentType }[] = [
  {
    bytes: [0x25, 0x50, 0x44, 0x46, 0x2d],
    type: { mimeType: "application/pdf", extension: "pdf" },
  },
  { bytes: [0xff, 0xd8, 0xff], type: { mimeType: "image/jpeg", extension: "jpg" } },
  {
    bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    type: { mimeType: "image/png", extension: "png" },
  },
];

/** Type of the file from its first bytes, or null when it is not a PDF, JPEG or PNG. */
export function detectDocumentType(bytes: Uint8Array): DocumentType | null {
  for (const { bytes: signature, type } of SIGNATURES) {
    if (bytes.length >= signature.length && signature.every((b, i) => bytes[i] === b)) return type;
  }
  return null;
}

/**
 * Validates an upload and returns its type.
 *
 * @throws {DomainError} FILE_TOO_LARGE (> 10 Mo), FILE_INVALID (empty, or not a
 * PDF, JPEG or PNG by its signature).
 */
export function checkDocumentFile(bytes: Uint8Array): DocumentType {
  if (bytes.length === 0) throw new DomainError("FILE_INVALID", "Le fichier est vide.");
  if (bytes.length > MAX_DOCUMENT_BYTES) {
    throw new DomainError(
      "FILE_TOO_LARGE",
      `Le fichier dépasse 10 Mo (${(bytes.length / 1024 / 1024).toFixed(1).replace(".", ",")} Mo).`,
    );
  }
  const type = detectDocumentType(bytes);
  if (!type) {
    throw new DomainError(
      "FILE_INVALID",
      "Seuls les fichiers PDF, JPEG et PNG sont acceptés (le contenu du fichier ne correspond à aucun de ces formats).",
    );
  }
  return type;
}

/**
 * Original file name, cleaned: no folder, accents removed, only letters,
 * digits, spaces, dots, dashes and underscores, 100 characters at most, and
 * the extension of the **detected** type.
 */
export function cleanFileName(name: string, type: DocumentType): string {
  const base = (name.split(/[\\/]/).pop() ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\.[^.]*$/, "")
    .replace(/[^A-Za-z0-9 ._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[ ._-]+|[ ._-]+$/g, "")
    .slice(0, 90);
  return `${base || "document"}.${type.extension}`;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
