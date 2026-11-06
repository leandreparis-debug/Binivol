import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { loadActor } from "@/server/auth/loadActor";
import { ForbiddenError } from "@/server/policy/can";
import type { Actor } from "@/server/policy/types";
import {
  accessLogPage,
  auditLogPage,
  frequentConsultations,
  logExport,
  parseLogFilters,
} from "@/server/services/logs";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};
const who = (key: string) => {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
};

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "diamant"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (actor) actors[key] = actor;
  }
}, 180_000);

describe("logs", () => {
  it("audit log: filters by person and action, paginated in the database", async () => {
    const person = await db.person.findFirstOrThrow({ where: { status: "ACTIVE" } });
    await db.auditLog.createMany({
      data: Array.from({ length: 3 }, (_, i) => ({
        actorId: who("topaze").userId,
        action: "UPDATE" as const,
        entity: "Person",
        entityId: person.id,
        field: `test${String(i)}`,
      })),
    });
    const page = await auditLogPage(
      db,
      who("topaze"),
      parseLogFilters({ personne: person.ref, action: "UPDATE" }),
      2,
    );
    expect(page.total).toBeGreaterThanOrEqual(3);
    expect(page.rows).toHaveLength(2);
    expect(page.rows.every((r) => r.entityId === person.id && r.action === "UPDATE")).toBe(true);
    const next = await auditLogPage(
      db,
      who("topaze"),
      parseLogFilters({ personne: person.ref, action: "UPDATE", page: "2" }),
      2,
    );
    expect(next.rows[0]?.id).not.toBe(page.rows[0]?.id);
    // An unknown person: nothing (not everything).
    expect(
      (await auditLogPage(db, who("topaze"), parseLogFilters({ personne: "P-99999" }))).total,
    ).toBe(0);
  });

  it("consultations: repeated reads of one person by one user within 24 h", async () => {
    const person = await db.person.findFirstOrThrow({ where: { status: "ACTIVE" } });
    await db.accessLog.createMany({
      data: Array.from({ length: 6 }, () => ({
        userId: who("diamant").userId,
        personId: person.id,
        scope: "SENSITIVE_VIEW" as const,
        context: "fiche",
      })),
    });
    const frequent = await frequentConsultations(db, who("topaze"));
    expect(frequent[0]).toMatchObject({ user: who("diamant").name, count: 6 });
    const page = await accessLogPage(
      db,
      who("topaze"),
      parseLogFilters({ auteur: who("diamant").userId, portee: "SENSITIVE_VIEW" }),
    );
    expect(page.total).toBeGreaterThanOrEqual(6);
  });

  it("export of a log is journaled; everything refused to a non-TOPAZE", async () => {
    const result = await logExport(db, who("topaze"), "audit", parseLogFilters({}));
    expect(result.csv.startsWith("﻿Date;Auteur;Action;Objet")).toBe(true);
    expect(
      await db.accessLog.count({ where: { context: { startsWith: "export:journal-audit:" } } }),
    ).toBe(1);
    await expect(auditLogPage(db, who("diamant"), parseLogFilters({}))).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(frequentConsultations(db, who("diamant"))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
