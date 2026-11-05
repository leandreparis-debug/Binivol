import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { loadActor } from "@/server/auth/loadActor";
import { can } from "@/server/policy/can";
import { loadPersonFacts } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import { listPersonDocuments } from "@/server/sensitive";
import { archiveDocument, openDocument, uploadDocument } from "@/server/services/documents";
import { localStorage } from "@/server/storage";
import { memoryStorage } from "@/server/storage/memory";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-04T00:00:00.000Z");
const PDF = Buffer.from("%PDF-1.7\n% Document fictif de test\n%%EOF\n");
const actors: Record<string, Actor> = {};
let root: string;

function who(key: string): Actor {
  const actor = actors[key];
  if (!actor) throw new Error(key);
  return actor;
}

async function filesIn(dir: string): Promise<string[]> {
  return (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => e.name);
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "diamant", "action"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (!actor) throw new Error(key);
    actors[key] = actor;
  }
  root = await mkdtemp(path.join(tmpdir(), "binivol-docs-"));
}, 180_000);

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const person = () =>
  db.person.findFirstOrThrow({ where: { status: "ACTIVE" }, orderBy: { ref: "asc" } });

describe("retired document kinds", () => {
  it("refuses a new diploma copy (ADR-049); Pegass is the reference", async () => {
    const p = await person();
    await expect(
      uploadDocument(db, localStorage(root), who("topaze"), {
        personId: p.id,
        kind: "DIPLOMA_COPY",
        expiresAt: null,
        fileName: "diplome.pdf",
        bytes: PDF,
      }),
    ).rejects.toThrow(/plus conservées/);
  });
});

describe("documents with the local driver", () => {
  it("uploads under a random key, then opens with a DOCUMENT_VIEW access log", async () => {
    const storage = localStorage(root);
    const p = await person();
    const id = await uploadDocument(db, storage, who("topaze"), {
      personId: p.id,
      kind: "B3_ATTESTATION",
      expiresAt: new Date("2027-12-31T00:00:00.000Z"),
      fileName: `${p.lastName} diplôme.pdf`,
      bytes: PDF,
    });
    const row = await db.document.findUniqueOrThrow({ where: { id } });
    expect(row.storageKey).toMatch(/^documents\/\d{4}\/[0-9a-f]{32}\.pdf$/);
    expect(row.storageKey.toLowerCase()).not.toContain(p.lastName.toLowerCase());
    expect(row).toMatchObject({
      mimeType: "application/pdf",
      sizeBytes: PDF.length,
      fileMissing: false,
    });
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entity: "Document", entityId: id },
    });
    expect(JSON.stringify(audit.newValue)).not.toContain(row.storageKey);

    const before = await db.accessLog.count({ where: { personId: p.id, scope: "DOCUMENT_VIEW" } });
    const opened = await openDocument(db, storage, who("topaze"), id, "fiche");
    expect(opened.body.equals(PDF)).toBe(true);
    expect(await db.accessLog.count({ where: { personId: p.id, scope: "DOCUMENT_VIEW" } })).toBe(
      before + 1,
    );
  });

  it("refuses an .exe renamed .pdf and an 11 Mo file, storing nothing", async () => {
    const storage = localStorage(root);
    const p = await person();
    const filesBefore = await filesIn(root);
    const rowsBefore = await db.document.count();
    await expect(
      uploadDocument(db, storage, who("topaze"), {
        personId: p.id,
        kind: "OTHER",
        expiresAt: null,
        fileName: "facture.pdf",
        bytes: Buffer.from("MZ\x90\x00 fictif"),
      }),
    ).rejects.toMatchObject({ code: "FILE_INVALID" });
    const big = Buffer.alloc(11 * 1024 * 1024);
    PDF.copy(big);
    await expect(
      uploadDocument(db, storage, who("topaze"), {
        personId: p.id,
        kind: "OTHER",
        expiresAt: null,
        fileName: "gros.pdf",
        bytes: big,
      }),
    ).rejects.toMatchObject({
      code: "FILE_TOO_LARGE",
      message: "Le fichier dépasse 10 Mo (11,0 Mo).",
    });
    expect(await filesIn(root)).toEqual(filesBefore);
    expect(await db.document.count()).toBe(rowsBefore);
  });

  it("archives (never deletes): hidden from DIAMANT, still listed and readable by TOPAZE", async () => {
    const storage = localStorage(root);
    // A newcomer is in the DIAMANT scope.
    const newcomer = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE", entryDate: { gt: new Date("2026-01-01T00:00:00.000Z") } },
    });
    const facts = await loadPersonFacts(db, newcomer.id, day);
    if (!facts) throw new Error("facts");
    expect(can(who("diamant"), "document.upload", { person: facts }).allowed).toBe(true);
    const id = await uploadDocument(db, storage, who("diamant"), {
      personId: newcomer.id,
      kind: "CHARTE",
      expiresAt: null,
      fileName: "charte.pdf",
      bytes: PDF,
    });
    await archiveDocument(db, who("diamant"), id);
    await expect(archiveDocument(db, who("diamant"), id)).rejects.toThrow(/déjà archivé/);
    expect(await db.document.findUnique({ where: { id } })).not.toBeNull();

    const forDiamant = await listPersonDocuments(db, who("diamant"), newcomer.id);
    expect(forDiamant.map((d) => d.id)).not.toContain(id);
    await expect(openDocument(db, storage, who("diamant"), id, "fiche")).rejects.toThrow();
    const forTopaze = await listPersonDocuments(db, who("topaze"), newcomer.id);
    expect(forTopaze.find((d) => d.id === id)?.archivedAt).not.toBeNull();
    await expect(openDocument(db, storage, who("topaze"), id, "fiche")).resolves.toBeTruthy();
  });

  it("says « Fichier absent » for a seed document without file", async () => {
    const missing = await db.document.findFirstOrThrow({ where: { fileMissing: true } });
    await expect(
      openDocument(db, localStorage(root), who("topaze"), missing.id, "fiche"),
    ).rejects.toMatchObject({
      code: "FILE_MISSING",
    });
  });
});

describe("documents: failures leave no orphan", () => {
  it("storage down: clear message and no Document row", async () => {
    const p = await person();
    const before = await db.document.count();
    await expect(
      uploadDocument(db, memoryStorage({ failPut: true }), who("topaze"), {
        personId: p.id,
        kind: "OTHER",
        expiresAt: null,
        fileName: "x.pdf",
        bytes: PDF,
      }),
    ).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
      message: expect.stringMatching(/injoignable/) as string,
    });
    expect(await db.document.count()).toBe(before);
  });

  it("database failure after storing: the stored file is removed", async () => {
    const storage = memoryStorage();
    await expect(
      uploadDocument(db, storage, who("topaze"), {
        personId: "personne_inexistante",
        kind: "OTHER",
        expiresAt: null,
        fileName: "x.pdf",
        bytes: PDF,
      }),
    ).rejects.toThrow();
    expect(storage.files.size).toBe(0);
  });
});
