import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { loadAlertPeople, loadAlertReferences } from "@/server/alerts/load";
import { statesOf } from "@/server/alerts/rules";
import { loadActor } from "@/server/auth/loadActor";
import { can, ForbiddenError } from "@/server/policy/can";
import { loadPersonFactsMany } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import { isValidState } from "@/server/qualification";
import { dashboardFor } from "@/server/services/dashboard";
import { directoryExport, matrixExport, prefectureExport } from "@/server/services/exports";
import { parseDirectoryQuery } from "@/server/services/directory";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};
const KEYS = ["topaze", "action", "laser", "format", "format-gp", "diamant", "format-diamant"];

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of KEYS) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (actor) actors[key] = actor;
  }
}, 180_000);

/** People of `actor` for `action` among the statuses, decided by can() (not SQL). */
async function seenByCan(actor: Actor, action: Parameters<typeof can>[1], statuses: string[]) {
  const people = await db.person.findMany({
    where: { status: { in: statuses as never }, archivedAt: null },
    select: { id: true },
  });
  const facts = await loadPersonFactsMany(
    db,
    people.map((p) => p.id),
    day,
  );
  return [...facts.values()]
    .filter((person) => can(actor, action, { person }).allowed)
    .map((f) => f.personId);
}

describe("home page by profile", () => {
  it("one block per profile, in a stable order, without duplicates", async () => {
    const blocks = await dashboardFor(db, who("format-diamant"), day);
    expect(blocks.map((b) => b.profile)).toEqual(["FORMAT", "DIAMANT"]);
    expect((await dashboardFor(db, who("topaze"), day)).map((b) => b.profile)).toEqual(["TOPAZE"]);
  });

  it("ACTION counts only the PSE of the people it sees", async () => {
    const [block] = await dashboardFor(db, who("action"), day);
    const ids = await seenByCan(who("action"), "training.read", ["ACTIVE", "PAUSED"]);
    const references = await loadAlertReferences(db);
    const pse = [...references.values()].find((r) => r.code === "PSE");
    const { people } = await loadAlertPeople(db, ids, day);
    const expected = people.filter((p) => {
      const state = pse ? statesOf(p, day, 60).get(pse.id) : undefined;
      return state !== undefined && isValidState(state.status);
    }).length;
    expect(block?.stats.find((s) => s.label === "PSE valides")?.value).toBe(expected);
    // FORMAT GP sees fewer people than everyone: its counts are its own.
    const all = await db.person.count({ where: { status: { in: ["ACTIVE", "PAUSED"] } } });
    const trainers = await seenByCan(who("format-gp"), "training.read", ["ACTIVE"]);
    expect(trainers.length).toBeLessThan(all);
    const [gpBlock] = await dashboardFor(db, who("format-gp"), day);
    expect(gpBlock?.stats.find((s) => s.label === "Formateurs et assistants actifs")?.value).toBe(
      trainers.length,
    );
  });

  it("DIAMANT counts the newcomers of its scope; the funnel has every open stage", async () => {
    const [block] = await dashboardFor(db, who("diamant"), day);
    const ids = await seenByCan(who("diamant"), "candidacy.manage", ["ACTIVE"]);
    const since = new Date("2025-11-06T00:00:00.000Z");
    const expected = await db.person.count({
      where: { id: { in: ids }, entryDate: { gt: since } },
    });
    expect(block?.stats.find((s) => s.label === "Nouveaux bénévoles")?.value).toBe(expected);
    expect(block?.funnel?.length).toBe(5);
    expect(block?.funnel?.some((s) => s.count > 0)).toBe(true);
    expect(block?.cohorts?.length).toBe(8);
  });

  it("TOPAZE counts every active volunteer", async () => {
    const [block] = await dashboardFor(db, who("topaze"), day);
    expect(block?.stats[0]).toMatchObject({
      label: "Bénévoles actifs",
      value: await db.person.count({ where: { status: "ACTIVE", archivedAt: null } }),
    });
  });
});

describe("exports", () => {
  it("préfecture: active volunteers with PSE or FPSE valid, journaled", async () => {
    const before = await db.accessLog.count({ where: { scope: "EXPORT" } });
    const result = await prefectureExport(db, who("topaze"), day);
    expect(result.csv.startsWith("﻿Nom;Prénom;NIVOL;Formation;Date d'obtention;Échéance\r\n")).toBe(
      true,
    );
    expect(result.rows).toBeGreaterThan(0);
    expect(result.fileName).toBe("binivol-prefecture-2026-11-06.csv");
    const lines = result.csv.trim().split("\r\n").slice(1);
    expect(lines.every((l) => /;(PSE|FPSE) : /.test(l))).toBe(true);
    // Only active people.
    const nivols = lines.map((l) => l.split(";")[2]).filter(Boolean);
    const statuses = await db.person.findMany({
      where: { nivol: { in: nivols as string[] } },
      select: { status: true },
    });
    expect(statuses.every((s) => s.status === "ACTIVE")).toBe(true);
    const log = await db.accessLog.findFirstOrThrow({
      where: { scope: "EXPORT" },
      orderBy: { at: "desc" },
    });
    expect(log).toMatchObject({
      userId: who("topaze").userId,
      context: `export:prefecture:${String(result.rows)} lignes`,
    });
    expect(await db.accessLog.count({ where: { scope: "EXPORT" } })).toBe(before + 1);
  });

  it("refused without the permission, and nothing journaled", async () => {
    const before = await db.accessLog.count({ where: { scope: "EXPORT" } });
    await expect(prefectureExport(db, who("diamant"), day)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      directoryExport(db, who("action"), parseDirectoryQuery({}), day),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(matrixExport(db, who("diamant"), null, day)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(await db.accessLog.count({ where: { scope: "EXPORT" } })).toBe(before);
  });

  it("matrix: the people of the perimeter only; directory: non-sensitive columns", async () => {
    const matrix = await matrixExport(db, who("laser"), "TRONC_COMMUN", day);
    const ids = await seenByCan(who("laser"), "training.read", ["ACTIVE", "PAUSED", "SUSPENDED"]);
    expect(matrix.rows).toBe(ids.length);
    expect(matrix.csv.split("\r\n")[0]).toBe("﻿Référence;Nom;GQS;CRB;TCAU;TCAS;PSC");
    const directory = await directoryExport(db, who("topaze"), parseDirectoryQuery({}), day);
    expect(directory.csv.split("\r\n")[0]).toBe(
      "﻿Référence;Nom;Prénom;NIVOL;Statut;E-mail;Téléphone;Compétences",
    );
    expect(directory.csv).not.toMatch(/\d{2}\/\d{2}\/(19|20)\d{2}/);
  });
});
