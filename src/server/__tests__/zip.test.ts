import { inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createZip } from "../zip";

/** Reads a ZIP back through its central directory (test helper). */
function readZip(zip: Buffer): Map<string, string> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i += 1) {
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const localName = zip.readUInt16LE(offset + 26);
    const start = offset + 30 + localName;
    out.set(name, inflateRawSync(zip.subarray(start, start + size)).toString("utf8"));
    at += 46 + nameLength;
  }
  return out;
}

describe("zip", () => {
  it("writes deflated UTF-8 entries that read back identical", () => {
    const zip = createZip([
      { name: "données.json", data: Buffer.from('{"prénom":"Alix"}') },
      { name: "documents/résumé.txt", data: Buffer.from("x".repeat(5000)) },
    ]);
    expect(zip.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const files = readZip(zip);
    expect(files.get("données.json")).toBe('{"prénom":"Alix"}');
    expect(files.get("documents/résumé.txt")).toBe("x".repeat(5000));
    expect(zip.length).toBeLessThan(1000);
  });
});
