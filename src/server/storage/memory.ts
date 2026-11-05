import { assertValidKey, StorageNotFoundError, type StorageService } from "./types";

/** In-memory driver for unit tests. Can be told to fail, to test the error paths. */
export function memoryStorage(options: { failPut?: boolean } = {}): StorageService & {
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  return {
    driver: "memory",
    files,
    put(key, body) {
      assertValidKey(key);
      if (options.failPut) return Promise.reject(new Error("stockage en panne (test)"));
      files.set(key, Buffer.from(body));
      return Promise.resolve();
    },
    get(key) {
      assertValidKey(key);
      const file = files.get(key);
      return file ? Promise.resolve(file) : Promise.reject(new StorageNotFoundError(key));
    },
    delete(key) {
      files.delete(key);
      return Promise.resolve();
    },
  };
}
