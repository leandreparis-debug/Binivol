// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { s3Storage } from "../s3";
import { StorageNotFoundError, StorageUnavailableError } from "../types";

/**
 * Test double of an S3 service (path-style): PUT, GET and DELETE of objects
 * in memory, `NoSuchKey` for a missing one. Signatures are not checked: the
 * point is the driver's requests and error mapping, not AWS itself.
 */
const objects = new Map<string, { body: Buffer; type: string }>();
const requests: string[] = [];
let server: Server;
let endpoint: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = req.url ?? "";
    const key = decodeURIComponent(url.split("?")[0] ?? "");
    requests.push(`${req.method ?? ""} ${key}`);
    if (req.method === "PUT") {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        objects.set(key, {
          body: Buffer.concat(chunks),
          type: req.headers["content-type"] ?? "",
        });
        res.writeHead(200, { ETag: '"fictif"' }).end();
      });
      return;
    }
    if (req.method === "GET") {
      const object = objects.get(key);
      if (!object) {
        res
          .writeHead(404, { "Content-Type": "application/xml" })
          .end(
            '<?xml version="1.0" encoding="UTF-8"?><Error><Code>NoSuchKey</Code><Message>missing</Message></Error>',
          );
        return;
      }
      res
        .writeHead(200, { "Content-Type": object.type, "Content-Length": object.body.length })
        .end(object.body);
      return;
    }
    if (req.method === "DELETE") {
      objects.delete(key);
      res.writeHead(204).end();
      return;
    }
    res.writeHead(405).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  endpoint = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => { resolve(); }));
});

const config = () => ({
  endpoint,
  region: "eu-west-3",
  bucket: "binivol-test",
  accessKeyId: "fictif",
  secretAccessKey: "fictif",
  forcePathStyle: true,
});

describe("s3 driver (against a test double)", () => {
  it("puts, gets and deletes an object in the bucket, path-style", async () => {
    const storage = s3Storage(config());
    await storage.put("documents/2026/abc.pdf", Buffer.from("%PDF-1.4 fictif"), "application/pdf");
    expect(objects.get("/binivol-test/documents/2026/abc.pdf")?.type).toBe("application/pdf");
    expect((await storage.get("documents/2026/abc.pdf")).toString()).toBe("%PDF-1.4 fictif");
    await storage.delete("documents/2026/abc.pdf");
    expect(objects.has("/binivol-test/documents/2026/abc.pdf")).toBe(false);
    expect(requests.some((r) => r.startsWith("PUT /binivol-test/documents/2026/abc.pdf"))).toBe(
      true,
    );
  });

  it("maps a missing object to StorageNotFoundError", async () => {
    await expect(s3Storage(config()).get("documents/2026/absent.pdf")).rejects.toBeInstanceOf(
      StorageNotFoundError,
    );
  });

  it("maps an unreachable service to StorageUnavailableError with a clear message", async () => {
    const storage = s3Storage({ ...config(), endpoint: "http://127.0.0.1:9", timeoutMs: 1000 });
    const error = await storage
      .put("documents/x.pdf", Buffer.from("x"), "application/pdf")
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(StorageUnavailableError);
    expect((error as Error).message).toMatch(/injoignable/);
  });

  it("refuses an invalid key without any request", async () => {
    const before = requests.length;
    await expect(s3Storage(config()).get("../x")).rejects.toThrow(/Clé de stockage refusée/);
    expect(requests.length).toBe(before);
  });
});
