import { getEnv } from "@/lib/env";
import { localStorage } from "./local";
import { s3Storage } from "./s3";
import type { StorageService } from "./types";

export * from "./keys";
export * from "./types";
export { localStorage } from "./local";
export { s3Storage } from "./s3";

const globalForStorage = globalThis as unknown as { binivolStorage?: StorageService };

/**
 * The configured storage (`STORAGE_DRIVER`), created once. Variables are
 * validated by `src/lib/env.ts`: with `s3`, the five S3_* values are required.
 */
export function getStorage(): StorageService {
  if (globalForStorage.binivolStorage) return globalForStorage.binivolStorage;
  const env = getEnv();
  const storage =
    env.STORAGE_DRIVER === "s3"
      ? s3Storage({
          endpoint: env.S3_ENDPOINT ?? "",
          region: env.S3_REGION ?? "",
          bucket: env.S3_BUCKET ?? "",
          accessKeyId: env.S3_ACCESS_KEY_ID ?? "",
          secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "",
          forcePathStyle: env.S3_FORCE_PATH_STYLE,
        })
      : localStorage(env.STORAGE_LOCAL_DIR);
  globalForStorage.binivolStorage = storage;
  return storage;
}
