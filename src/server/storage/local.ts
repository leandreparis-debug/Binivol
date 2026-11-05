import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertValidKey,
  InvalidStorageKeyError,
  StorageNotFoundError,
  StorageUnavailableError,
  type StorageService,
} from "./types";

/**
 * `local` driver: one folder on disk (development, VPS). Keys map to paths
 * under `root`; any key that would leave it (`..`, absolute path, symlink
 * tricks in the key itself) is refused before touching the disk.
 *
 * Back the folder up with the database (docs/storage.md).
 */
export function localStorage(root: string): StorageService {
  const base = path.resolve(root);

  function resolve(key: string): string {
    assertValidKey(key);
    const target = path.resolve(base, key);
    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new InvalidStorageKeyError(key);
    }
    return target;
  }

  return {
    driver: "local",
    async put(key, body) {
      const target = resolve(key);
      try {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, body, { mode: 0o600 });
      } catch (error) {
        throw new StorageUnavailableError({ cause: error });
      }
    },
    async get(key) {
      const target = resolve(key);
      try {
        return await readFile(target);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new StorageNotFoundError(key);
        throw new StorageUnavailableError({ cause: error });
      }
    },
    async delete(key) {
      await rm(resolve(key), { force: true });
    },
  };
}
