import { randomBytes } from "node:crypto";

/**
 * A new random storage key: `documents/<year>/<32 hex chars>.<ext>`. It never
 * contains the person's name nor the original file name.
 */
export function newStorageKey(
  extension: "pdf" | "jpg" | "png",
  prefix = "documents",
  now = new Date(),
): string {
  return `${prefix}/${String(now.getUTCFullYear())}/${randomBytes(16).toString("hex")}.${extension}`;
}
