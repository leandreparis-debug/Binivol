import { beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import type { PolicyAction } from "@/lib/actions";
import { seedDemo, seedUserEmail, USERS } from "../../../../prisma/seed/index";
import { loadActor } from "@/server/auth/loadActor";
import { can, personPageAccess } from "@/server/policy/can";
import { loadPersonFacts, loadPersonFactsMany } from "@/server/policy/facts";
import type { Actor, PersonFacts } from "@/server/policy/types";
import { personPageSql, visibleSql, type VisibilityContext } from "@/server/policy/visibility";
import { numericSettings } from "@/server/settings";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-04T00:00:00.000Z");
let ctx: VisibilityContext;
let facts: Map<string, PersonFacts>;
const actors = new Map<string, Actor>();

/** Every rule that targets a person alone. */
const PERSON_ACTIONS: PolicyAction[] = [
  "person.directory.read",
  "person.full.read",
  "person.sensitive.read",
  "person.update",
  "person.status.change",
  "training.read",
  "training.write",
  "trainingWish.manage",
  "appointment.read",
  "candidacy.manage",
  "dossier.manage",
  "mentorship.manage",
  "followUp.manage",
  "document.read",
  "document.upload",
];

beforeAll(async () => {
  await seedDemo(db, { today: day });
  // The seed has no archived person: archive an active volunteer and a candidate.
  const [active, candidate] = await Promise.all([
    db.person.findFirstOrThrow({ where: { status: "ACTIVE" }, orderBy: { ref: "desc" } }),
    db.person.findFirstOrThrow({ where: { status: "CANDIDATE" }, orderBy: { ref: "desc" } }),
  ]);
  await db.person.updateMany({
    where: { id: { in: [active.id, candidate.id] } },
    data: { archivedAt: new Date() },
  });
  ctx = { day, newVolunteerMonths: (await numericSettings(db)).newVolunteerMonths };
  const ids = (await db.person.findMany({ select: { id: true } })).map((p) => p.id);
  facts = await loadPersonFactsMany(db, ids, day);
  for (const user of USERS) {
    const row = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(user.key) } });
    const actor = await loadActor(db, row.id);
    if (!actor) throw new Error(`no actor for ${user.key}`);
    actors.set(user.key, actor);
  }
}, 180_000);

async function sqlVisible(actor: Actor, action: PolicyAction): Promise<string[]> {
  const where = visibleSql(actor, action, ctx);
  const rows = await db.$queryRaw<{ id: string }[]>(
    Prisma.sql`SELECT p.id FROM persons p WHERE ${where} ORDER BY p.id`,
  );
  return rows.map((r) => r.id);
}

function canVisible(actor: Actor, action: PolicyAction): string[] {
  return [...facts.values()]
    .filter((person) => can(actor, action, { person }).allowed)
    .map((p) => p.personId)
    .sort();
}

describe("visibility in SQL mirrors can()", () => {
  it("batch facts equal the facts loaded one by one", async () => {
    for (const [id, batch] of facts) {
      expect(await loadPersonFacts(db, id, day)).toEqual(batch);
    }
  });

  it.each(USERS.map((u) => [u.key]))(
    "%s: same people as can() for every action on a person",
    async (key) => {
      const actor = actors.get(key);
      if (!actor) throw new Error(key);
      for (const action of PERSON_ACTIONS) {
        const expected = canVisible(actor, action);
        expect({ action, ids: await sqlVisible(actor, action) }).toEqual({
          action,
          ids: expected,
        });
      }
    },
  );

  it.each(USERS.map((u) => [u.key]))(
    "%s: the person page opens (full or reduced) for the same people as personPageAccess()",
    async (key) => {
      const actor = actors.get(key);
      if (!actor) throw new Error(key);
      const rows = await db.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT p.id FROM persons p WHERE ${personPageSql(actor, ctx)} ORDER BY p.id`,
      );
      const expected = [...facts.values()]
        .filter((person) => personPageAccess(actor, person) !== null)
        .map((p) => p.personId)
        .sort();
      expect(rows.map((r) => r.id)).toEqual(expected);
    },
  );

  it("the directory rule gives the expected volumes on the seed", async () => {
    const counts: Record<string, number> = {};
    for (const [key, actor] of actors) {
      counts[key] = (await sqlVisible(actor, "person.directory.read")).length;
    }
    // 62 people, 8 candidates, 2 archived (one of them a candidate).
    expect(counts).toEqual({
      topaze: 62,
      action: 53,
      laser: 53,
      format: 53,
      "format-gp": 53,
      diamant: 60,
      "format-diamant": 60,
    });
  });

  it("refuses an action that does not target a person", () => {
    const actor = actors.get("topaze");
    if (!actor) throw new Error("topaze");
    expect(() => visibleSql(actor, "user.manage", ctx)).toThrow(/ne porte pas sur une personne/);
  });
});
