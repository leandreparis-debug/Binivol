import { inflateRawSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { loadActor } from "@/server/auth/loadActor";
import { ForbiddenError } from "@/server/policy/can";
import type { Actor } from "@/server/policy/types";
import { gdprExport } from "@/server/services/gdprExport";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};

function names(zip: Buffer): Map<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i += 1) {
    const size = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const offset = zip.readUInt32LE(at + 42);
    const name = zip.subarray(at + 46, at + 46 + nameLength).toString("utf8");
    const start = offset + 30 + zip.readUInt16LE(offset + 26);
    out.set(name, inflateRawSync(zip.subarray(start, start + size)));
    at += 46 + nameLength;
  }
  return out;
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "diamant"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (actor) actors[key] = actor;
  }
}, 180_000);

describe("GDPR export of a person", () => {
  it("TOPAZE gets JSON, PDF and the missing files listed; journaled", async () => {
    const topaze = actors.topaze;
    if (!topaze) throw new Error("topaze");
    const person = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE", documents: { some: {} } },
    });
    const before = await db.accessLog.count({ where: { personId: person.id } });
    const result = await gdprExport(db, null, topaze, person.id, new Date("2026-11-06T10:00:00Z"));
    expect(result.fileName).toBe(`binivol-rgpd-${person.ref}-2026-11-06.zip`);
    const files = names(result.zip);
    const json = JSON.parse(files.get("donnees.json")?.toString("utf8") ?? "{}") as {
      personne: { nom: string; reference: string };
      donnees_sensibles: { _commentaire: string };
      fichiers_absents: string[];
      _lisez_moi: string;
    };
    expect(json.personne).toMatchObject({ nom: person.lastName, reference: person.ref });
    expect(json.donnees_sensibles._commentaire).toMatch(/jamais de copie du casier/);
    expect(json.fichiers_absents.length).toBeGreaterThan(0);
    expect(result.missingFiles).toEqual(json.fichiers_absents);
    expect(files.get("resume.pdf")?.subarray(0, 5).toString()).toBe("%PDF-");
    const logs = await db.accessLog.findMany({
      where: { personId: person.id, at: { gte: new Date(Date.now() - 60_000) } },
      select: { scope: true, context: true },
    });
    expect(logs.length).toBeGreaterThan(before === 0 ? 0 : 0);
    expect(logs).toContainEqual({ scope: "EXPORT", context: "export RGPD" });
    expect(logs).toContainEqual({ scope: "SENSITIVE_VIEW", context: "export RGPD" });
  });

  it("refused to anyone but TOPAZE", async () => {
    const diamant = actors.diamant;
    if (!diamant) throw new Error("diamant");
    const person = await db.person.findFirstOrThrow({ where: { status: "CANDIDATE" } });
    await expect(gdprExport(db, null, diamant, person.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
