import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { isMinorOn } from "@/lib/age";
import { loadActor } from "@/server/auth/loadActor";
import { createDb } from "@/server/db";
import { can } from "@/server/policy/can";
import { loadPersonFactsMany } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import {
  listDirectory,
  parseDirectoryQuery,
  type DirectoryQuery,
  type DirectoryRow,
} from "@/server/services/directory";
import { qualificationsOf } from "@/server/trainingSummary";
import { getTestDb, resolveTestDatabaseUrl } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-04T00:00:00.000Z");
const actors: Record<string, Actor> = {};
const query = (params: Record<string, string> = {}): DirectoryQuery => parseDirectoryQuery(params);

async function actorFor(key: string): Promise<Actor> {
  const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
  const actor = await loadActor(db, user.id);
  if (!actor) throw new Error(key);
  return actor;
}

/** Every page of a query, following the cursor. */
async function allRows(actor: Actor, q: DirectoryQuery, pageSize = 7): Promise<DirectoryRow[]> {
  const rows: DirectoryRow[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i += 1) {
    const page = await listDirectory(db, actor, { ...q, apres: cursor }, { day, pageSize });
    rows.push(...page.rows);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

/** Oracle: the people `actor` may see in the directory, by `can()`, with default statuses. */
async function expectedVisible(actor: Actor, statuses = ["ACTIVE", "PAUSED", "SUSPENDED"]) {
  const people = await db.person.findMany({
    where: { status: { in: statuses as never[] }, archivedAt: null },
    select: { id: true },
  });
  const facts = await loadPersonFactsMany(
    db,
    people.map((p) => p.id),
    day,
  );
  return [...facts.values()]
    .filter((person) => can(actor, "person.directory.read", { person }).allowed)
    .map((f) => f.personId)
    .sort();
}

function who(key: string): Actor {
  const actor = actors[key];
  if (!actor) throw new Error(`no actor ${key}`);
  return actor;
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "action", "laser", "format", "format-gp", "diamant"]) {
    actors[key] = await actorFor(key);
  }
}, 180_000);

const topaze = () => who("topaze");

describe("directory: visibility, count and pagination", () => {
  it.each(["topaze", "action", "laser", "format", "format-gp", "diamant"])(
    "%s sees exactly the people allowed by can(), and the count matches",
    async (key) => {
      const actor = who(key);
      const first = await listDirectory(db, actor, query(), { day });
      const rows = await allRows(actor, query());
      const expected = await expectedVisible(actor);
      expect(ids(rows)).toEqual(expected);
      expect(first.total).toBe(expected.length);
    },
  );

  it("paginates by cursor without duplicate nor gap, in name order", async () => {
    const rows = await allRows(
      topaze(),
      query({ statut: "CANDIDATE,ACTIVE,PAUSED,SUSPENDED,INACTIVE,LEFT" }),
      7,
    );
    expect(rows).toHaveLength(60);
    expect(new Set(rows.map((r) => r.id)).size).toBe(60);
    const names = rows.map((r) =>
      r.lastName
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase(),
    );
    expect([...names].sort((a, b) => a.localeCompare(b, "en"))).toEqual(
      names.slice().sort((a, b) => a.localeCompare(b, "en")),
    );
  });

  it("never shows a candidate to ACTION, even with the CANDIDATE status filter", async () => {
    const page = await listDirectory(db, who("action"), query({ statut: "CANDIDATE" }), {
      day,
    });
    expect(page.rows).toEqual([]);
    expect(page.total).toBe(0);
    const diamant = await listDirectory(db, who("diamant"), query({ statut: "CANDIDATE" }), {
      day,
    });
    expect(diamant.total).toBe(6);
  });

  it("links a line to the person page only with person.full.read, and hides trainings without training.read", async () => {
    const flags: { open: boolean; training: boolean }[] = [];
    for (const key of ["action", "laser", "format", "format-gp", "diamant"]) {
      const actor = who(key);
      const rows = await allRows(actor, query({ statut: "ACTIVE,PAUSED,SUSPENDED,INACTIVE,LEFT" }));
      const facts = await loadPersonFactsMany(db, ids(rows), day);
      for (const row of rows) {
        const person = facts.get(row.id);
        if (!person) throw new Error(row.id);
        expect(row.canOpen).toBe(can(actor, "person.full.read", { person }).allowed);
        expect(row.training !== null).toBe(can(actor, "training.read", { person }).allowed);
        flags.push({ open: row.canOpen, training: row.training !== null });
      }
    }
    // Not vacuous: every combination the policy allows shows up.
    expect(flags.some((f) => !f.open)).toBe(true);
    expect(flags.some((f) => f.open)).toBe(true);
    expect(flags.some((f) => !f.training)).toBe(true);
  });
});

describe("directory: search and filters", () => {
  it("searches without accents nor case, on names and NIVOL (spaces allowed)", async () => {
    const person = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE", nivol: { not: null } },
      orderBy: { ref: "asc" },
    });
    const accentless = person.lastName
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toUpperCase();
    const byName = await allRows(topaze(), query({ q: accentless }));
    expect(byName.map((r) => r.id)).toContain(person.id);
    const nivol = person.nivol ?? "";
    const spaced = `${nivol.slice(0, 3)} ${nivol.slice(3, 7)} ${nivol.slice(7).toLowerCase()}`;
    const byNivol = await allRows(topaze(), query({ q: spaced }));
    expect(byNivol.map((r) => r.id)).toEqual([person.id]);
    const both = await allRows(topaze(), query({ q: `${person.firstName} ${person.lastName}` }));
    expect(both.map((r) => r.id)).toContain(person.id);
  });

  it("combines statuses", async () => {
    const rows = await allRows(topaze(), query({ statut: "LEFT,INACTIVE" }));
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(["LEFT", "INACTIVE"]));
    expect(rows).toHaveLength(
      await db.person.count({ where: { status: { in: ["LEFT", "INACTIVE"] } } }),
    );
  });

  it("filters by perimeter like perimetersOf", async () => {
    const rows = await allRows(topaze(), query({ perimetre: "FORMAT_GP" }));
    const all = await db.person.findMany({
      where: { status: { in: ["ACTIVE", "PAUSED", "SUSPENDED"] } },
      select: { id: true },
    });
    const facts = await loadPersonFactsMany(
      db,
      all.map((p) => p.id),
      day,
    );
    const expected = [...facts.values()]
      .filter((f) => f.perimeters.has("FORMAT_GP"))
      .map((f) => f.personId)
      .sort();
    expect(expected.length).toBeGreaterThan(0);
    expect(ids(rows)).toEqual(expected);
  });

  it("filters by a valid qualification, and by deadline (soon, expired) like qualificationsOf", async () => {
    const records = await db.trainingRecord.findMany({
      where: {
        result: "PASSED",
        cancelledAt: null,
        person: { status: { in: ["ACTIVE", "PAUSED", "SUSPENDED"] } },
      },
      include: { reference: true },
    });
    const byPerson = new Map<string, typeof records>();
    for (const r of records) byPerson.set(r.personId, [...(byPerson.get(r.personId) ?? []), r]);
    const states = new Map(
      [...byPerson].map(([id, list]) => [
        id,
        qualificationsOf(
          list.map((r) => ({ ...r, ...r.reference, referenceId: r.referenceId })),
          day,
          60,
        ),
      ]),
    );
    const pick = (fn: (s: ReturnType<typeof qualificationsOf>) => boolean) =>
      [...states]
        .filter(([, s]) => fn(s))
        .map(([id]) => id)
        .sort();

    const pse = await allRows(topaze(), query({ qualification: "pse" }));
    expect(ids(pse)).toEqual(
      pick((s) => s.some((q) => q.code === "PSE" && q.deadline !== "expired")),
    );
    const soon = await allRows(topaze(), query({ echeance: "proche" }));
    expect(ids(soon)).toEqual(pick((s) => s.some((q) => q.deadline === "soon")));
    const expired = await allRows(topaze(), query({ echeance: "expiree" }));
    expect(ids(expired)).toEqual(pick((s) => s.some((q) => q.deadline === "expired")));
    expect(soon.length + expired.length).toBeGreaterThan(0);
  });

  it("filters minors and trainers", async () => {
    const minors = await allRows(topaze(), query({ mineur: "1", statut: "ACTIVE,CANDIDATE" }));
    const sensitive = await db.personSensitive.findMany({
      where: { person: { status: { in: ["ACTIVE", "CANDIDATE"] } } },
      select: { personId: true, birthDate: true },
    });
    expect(ids(minors)).toEqual(
      sensitive
        .filter((s) => isMinorOn(s.birthDate, day))
        .map((s) => s.personId)
        .sort(),
    );
    expect(minors.length).toBeGreaterThan(0);
    const trainers = await allRows(topaze(), query({ formateur: "1" }));
    expect(trainers.length).toBe(
      await db.person.count({
        where: { isTrainer: true, status: { in: ["ACTIVE", "PAUSED", "SUSPENDED"] } },
      }),
    );
  });

  it("ignores invalid URL values", () => {
    expect(
      parseDirectoryQuery({
        statut: "ACTIVE,NOPE",
        echeance: "demain",
        apres: "../x",
        qualification: "x y",
      }),
    ).toMatchObject({ statut: ["ACTIVE"], echeance: null, apres: null, qualification: null });
  });
});

describe("directory: number of queries", () => {
  it("is bounded and does not grow with the page size", async () => {
    const queries: string[] = [];
    const counted = createDb(resolveTestDatabaseUrl(), { onQuery: (q) => queries.push(q) });
    try {
      const actor = who("action");
      await listDirectory(counted, actor, query(), { day, pageSize: 5 });
      const small = queries.length;
      queries.length = 0;
      await listDirectory(counted, actor, query(), { day, pageSize: 50 });
      const large = queries.length;
      expect(small).toBeLessThanOrEqual(15);
      expect(large).toBe(small);
    } finally {
      await counted.$disconnect();
    }
  });
});
