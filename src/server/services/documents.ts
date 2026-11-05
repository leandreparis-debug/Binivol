import type { DocumentKind } from "@/generated/prisma/enums";
import type { Db } from "../db";
import { checkDocumentFile, cleanFileName, sha256Hex } from "../documentFile";
import { DomainError } from "../errors";
import type { Actor } from "../policy/types";
import {
  archiveDocumentRow,
  insertDocumentRow,
  readDocument,
  type DocumentView,
} from "../sensitive";
import {
  newStorageKey,
  StorageNotFoundError,
  StorageUnavailableError,
  type StorageService,
} from "../storage";

/**
 * Documents of a person: upload, archive, open. The caller authorised the
 * action (`document.upload`, or `document.read` through `readDocument`).
 *
 * Order of an upload: check the file → store it under a random key → insert
 * the row. If the storage fails, no row is created; if the database fails,
 * the stored file is removed (no orphan either way).
 */

export interface UploadInput {
  personId: string;
  kind: DocumentKind;
  expiresAt: Date | null;
  fileName: string;
  bytes: Uint8Array;
}

export async function uploadDocument(
  db: Db,
  storage: StorageService,
  actor: Actor,
  input: UploadInput,
): Promise<string> {
  const type = checkDocumentFile(input.bytes);
  const key = newStorageKey(type.extension);
  const body = Buffer.from(input.bytes);
  try {
    await storage.put(key, body, type.mimeType);
  } catch (error) {
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      error instanceof StorageUnavailableError
        ? error.message
        : "Le stockage des documents est injoignable pour le moment. Réessayez plus tard ; rien n'a été enregistré.",
      { cause: error },
    );
  }
  try {
    return await insertDocumentRow(db, actor, {
      personId: input.personId,
      kind: input.kind,
      storageKey: key,
      fileName: cleanFileName(input.fileName, type),
      mimeType: type.mimeType,
      sizeBytes: body.length,
      sha256: sha256Hex(body),
      expiresAt: input.expiresAt,
    });
  } catch (error) {
    await storage.delete(key).catch(() => undefined);
    throw error;
  }
}

export async function archiveDocument(db: Db, actor: Actor, documentId: string): Promise<void> {
  await archiveDocumentRow(db, actor, documentId);
}

export interface OpenedDocument {
  meta: DocumentView;
  body: Buffer;
}

/**
 * Opens a document: `document.read` checked and the consultation journaled
 * (`DOCUMENT_VIEW`) by `readDocument`, then the bytes are read.
 *
 * @throws {DomainError} FILE_MISSING when the row has no file (seed, import)
 * or the file is gone; STORAGE_UNAVAILABLE when the storage cannot be reached.
 */
export async function openDocument(
  db: Db,
  storage: StorageService,
  actor: Actor,
  documentId: string,
  context: string,
): Promise<OpenedDocument> {
  const meta = await readDocument(db, actor, documentId, context);
  if (meta.fileMissing) throw new DomainError("FILE_MISSING", "Fichier absent.");
  try {
    return { meta, body: await storage.get(meta.storageKey) };
  } catch (error) {
    if (error instanceof StorageNotFoundError) {
      throw new DomainError("FILE_MISSING", "Fichier absent du stockage.", { cause: error });
    }
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Le stockage des documents est injoignable pour le moment.",
      { cause: error },
    );
  }
}
