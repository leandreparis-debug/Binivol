import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { loadActor } from "@/server/auth/loadActor";
import { ForbiddenError } from "@/server/policy/can";
import type { Actor } from "@/server/policy/types";
import {
  purgeCandidates,
  purgePeople,
  retryStorageOrphans,
  runPurge,
} from "@/server/services/purge";
import type { StorageService } from "@/server/storage/types";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

function storage(fail = false): StorageService & { deleted: string[] } {
  const deleted: string[] = [];
  return {
    driver: "memory",
    deleted,
    put: () => Promise.resolve(),
    get: () => Promise.reject(new Error("absent")),
    delete: (key: string) => {
      if (fail) return Promise.reject(new Error("Stockage indisponible"));
      deleted.push(key);
      return Promise.resolve();
    },
  };
}

/** Rows that still name the person, in every table having a person column. */
async function remaining(personId: string): Promise<Record<string, number>> {
  const columns = await db.$queryRaw<{ table_name: string; column_name: string }[]>`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name IN ('person_id', 'mentee_id', 'mentor_id', 'entity_id')`;
  const out: Record<string, number> = {};
  for (const c of columns) {
    const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "${c.table_name}" WHERE "${c.column_name}" = $1`,
      personId,
    );
    const n = Number(rows[0]?.n ?? 0);
    if (n > 0) out[`${c.table_name}.${c.column_name}`] = n;
  }
  const persons = await db.person.count({ where: { id: personId } });
  if (persons > 0) out.persons = persons;
  return out;
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "diamant"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (actor) actors[key] = actor;
  }
  // An abandoned candidacy closed 13 months ago: eligible.
  const abandoned = await db.candidacy.findFirstOrThrow({ where: { stage: "ABANDONED" } });
  await db.candidacy.update({
    where: { id: abandoned.id },
    data: { closedAt: new Date("2025-10-01T00:00:00.000Z") },
  });
}, 180_000);

describe("GDPR purge", () => {
  it("lists the eligible people (TOPAZE only); MANUAL mode purges nothing by itself", async () => {
    await expect(purgeCandidates(db, who("diamant"), day)).rejects.toBeInstanceOf(ForbiddenError);
    const list = await purgeCandidates(db, who("topaze"), day);
    expect(list.map((c) => c.rule).sort()).toEqual(["ABANDONED", "RETENTION"]);
    const before = await db.person.count();
    const result = await runPurge(db, storage(), day);
    expect(result).toMatchObject({ mode: "MANUAL", eligible: 2, purged: 0 });
    expect(await db.person.count()).toBe(before);
    expect(
      await db.notification.count({ where: { dedupeKey: { startsWith: "PURGE_PENDING:" } } }),
    ).toBeGreaterThan(0);
  });

  it("refuses a person who is not eligible", async () => {
    const active = await db.person.findFirstOrThrow({ where: { status: "ACTIVE" } });
    await expect(
      purgePeople(db, storage(), who("topaze"), { personIds: [active.id] }, day),
    ).rejects.toThrow(/pas éligible/);
    await expect(
      purgePeople(db, storage(), who("diamant"), { personIds: [active.id] }, day),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("purges a person who left: nothing left in the database, logs anonymised, minimal trace", async () => {
    const [target] = (await purgeCandidates(db, who("topaze"), day)).filter(
      (c) => c.rule === "RETENTION",
    );
    if (!target) throw new Error("no retention candidate");
    // Logs about her exist before.
    await db.accessLog.create({
      data: {
        userId: who("topaze").userId,
        personId: target.id,
        scope: "SENSITIVE_VIEW",
        context: "fiche",
      },
    });
    const auditBefore = await db.auditLog.count();
    const store = storage();
    const outcome = await purgePeople(db, store, who("topaze"), { personIds: [target.id] }, day);
    expect(outcome).toEqual({ purged: 1, orphans: 0 });
    expect(await remaining(target.id)).toEqual({});
    // Logs kept (anonymised), plus one trace.
    expect(await db.auditLog.count()).toBe(auditBefore + 1);
    const trace = await db.auditLog.findFirstOrThrow({
      where: { action: "PURGE" },
      orderBy: { at: "desc" },
    });
    expect(trace).toMatchObject({
      actorId: who("topaze").userId,
      entity: "Person",
      field: "purge",
    });
    expect(trace.newValue).toMatchObject({ count: 1, rule: "RETENTION" });
    expect(JSON.stringify(trace)).not.toContain(target.name.split(" ")[1] ?? "§");
    const anonymised = await db.accessLog.findMany({ where: { personId: trace.entityId } });
    expect(anonymised.length).toBe(1);
    expect(anonymised[0]?.context).toBeNull();
  });

  it("purges an abandoned candidate; a file that cannot be deleted is kept for a new attempt", async () => {
    const [target] = await purgeCandidates(db, who("topaze"), day);
    if (!target) throw new Error("no candidate");
    expect(target.rule).toBe("ABANDONED");
    await db.storageOrphan.deleteMany();
    // Give her a stored document so that the storage is involved.
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO documents (id, person_id, kind, copy, storage_key, file_name, mime_type, size_bytes, sha256, created_at, updated_at)
        VALUES ('doc_purge_test', ${target.id}, 'OTHER', 'UL', 'purge/test-key', 'test.pdf', 'application/pdf', 10, ${"0".repeat(64)}, now(), now())`;
    });
    const outcome = await purgePeople(
      db,
      storage(true),
      who("topaze"),
      { personIds: [target.id] },
      day,
    );
    expect(outcome).toEqual({ purged: 1, orphans: 1 });
    expect(await remaining(target.id)).toEqual({});
    expect(await db.storageOrphan.count({ where: { storageKey: "purge/test-key" } })).toBe(1);
    // Retried later, it goes.
    expect(await retryStorageOrphans(db, storage(), who("topaze"))).toEqual({
      deleted: 1,
      remaining: 0,
    });
    expect(await db.storageOrphan.count()).toBe(0);
  });
});
