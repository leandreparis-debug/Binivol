/**
 * Storage of files (documents, later signatures and generated PDFs) behind
 * one interface, so the application moves from Supabase Storage to a VPS
 * folder or MinIO by configuration only (`STORAGE_DRIVER`).
 *
 * Keys are opaque, random and never contain a person's name
 * (`newStorageKey`). There is deliberately **no method returning a URL**:
 * files are always streamed by the application after an authorisation check
 * and an access log (see docs/storage.md, ADR-027).
 */
export interface StorageService {
  /** Driver name, for logs and the health check. */
  readonly driver: "local" | "s3" | "memory";
  /** Writes `body` at `key` (overwrites). */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Reads the file at `key`. @throws {StorageNotFoundError} when absent. */
  get(key: string): Promise<Buffer>;
  /** Deletes the file at `key`; no error when absent. Only used to clean up a failed upload. */
  delete(key: string): Promise<void>;
}

/** The file does not exist in the storage. */
export class StorageNotFoundError extends Error {
  constructor(key: string) {
    super(`Fichier introuvable dans le stockage (${key}).`);
    this.name = "StorageNotFoundError";
  }
}

/** The storage cannot be reached or refused the operation. The message is safe to show. */
export class StorageUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(
      "Le stockage des documents est injoignable pour le moment. Réessayez plus tard ; rien n'a été enregistré.",
      options,
    );
    this.name = "StorageUnavailableError";
  }
}

/** A key outside the rules (path traversal, absolute path…). */
export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Clé de stockage refusée : « ${key} ».`);
    this.name = "InvalidStorageKeyError";
  }
}

const KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9._-]*)*$/;

/**
 * Validates a storage key: lower-case segments separated by `/`, no `..`,
 * no leading `/`, no backslash, no empty segment.
 *
 * @throws {InvalidStorageKeyError}
 */
export function assertValidKey(key: string): void {
  if (
    key.length === 0 ||
    key.length > 300 ||
    key.includes("..") ||
    key.includes("\\") ||
    key.startsWith("/") ||
    !KEY_PATTERN.test(key)
  ) {
    throw new InvalidStorageKeyError(key);
  }
}
