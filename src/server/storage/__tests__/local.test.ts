// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { localStorage } from "../local";
import { newStorageKey } from "../keys";
import { assertValidKey, InvalidStorageKeyError, StorageNotFoundError } from "../types";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "binivol-storage-"));
});
afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("storage keys", () => {
  it("are random, dated and never contain a name", () => {
    const a = newStorageKey("pdf", "documents", new Date("2026-11-05T10:00:00Z"));
    const b = newStorageKey("pdf", "documents", new Date("2026-11-05T10:00:00Z"));
    expect(a).toMatch(/^documents\/2026\/[0-9a-f]{32}\.pdf$/);
    expect(a).not.toBe(b);
    expect(() => { assertValidKey(a); }).not.toThrow();
  });

  it.each([
    "../secret",
    "documents/../../etc/passwd",
    "/etc/passwd",
    "documents\\x",
    "",
    "Documents/A.pdf",
    "documents//a.pdf",
    "documents/./a.pdf",
  ])("refuses the key %j", (key) => {
    expect(() => { assertValidKey(key); }).toThrow(InvalidStorageKeyError);
  });
});

describe("local driver", () => {
  it("writes, reads and deletes inside its folder", async () => {
    const storage = localStorage(root);
    await storage.put("documents/2026/abc.pdf", Buffer.from("%PDF-1.4 fictif"), "application/pdf");
    expect((await readFile(path.join(root, "documents/2026/abc.pdf"))).toString()).toBe(
      "%PDF-1.4 fictif",
    );
    expect((await storage.get("documents/2026/abc.pdf")).toString()).toBe("%PDF-1.4 fictif");
    await storage.delete("documents/2026/abc.pdf");
    await expect(storage.get("documents/2026/abc.pdf")).rejects.toBeInstanceOf(
      StorageNotFoundError,
    );
    await expect(storage.delete("documents/2026/abc.pdf")).resolves.toBeUndefined();
  });

  it("refuses any key that would leave its folder, before touching the disk", async () => {
    const storage = localStorage(root);
    await expect(
      storage.put("../evasion.pdf", Buffer.from("x"), "application/pdf"),
    ).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(storage.get("/etc/passwd")).rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(storage.delete("documents/../../x")).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
  });
});
