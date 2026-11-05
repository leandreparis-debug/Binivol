import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { statusChangeSchema } from "@/lib/personForms";
import { loadActor } from "@/server/auth/loadActor";
import { ForbiddenError } from "@/server/policy/can";
import type { Actor } from "@/server/policy/types";
import { b3ToCheck, readPersonSensitive, recordB3Check } from "@/server/sensitive";
import { completeFollowUp, followUpBoard, mentorshipBoard } from "@/server/services/followUps";
import { changePersonStatus } from "@/server/services/personWrites";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "diamant", "action"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (!actor) throw new Error(key);
    actors[key] = actor;
  }
}, 180_000);

describe("departure, pause and return", () => {
  it("departure ends the appointments and the mentorships in one transaction, computes the purge date", async () => {
    const appointment = await db.appointment.findFirstOrThrow({
      where: { endDate: null, cancelledAt: null, person: { status: "ACTIVE" } },
    });
    const personId = appointment.personId;
    const mentorship = await db.mentorship.findFirst({ where: { endDate: null } });
    if (mentorship)
      await db.mentorship.update({ where: { id: mentorship.id }, data: { mentorId: personId } });
    const result = await changePersonStatus(
      db,
      who("topaze"),
      statusChangeSchema.parse({
        personId,
        status: "LEFT",
        leftAt: "2026-11-01",
        leftReason: "MOVED",
        endAppointments: true,
        endMentorships: true,
      }),
      day,
    );
    expect(result.endedAppointments).toBeGreaterThanOrEqual(1);
    if (mentorship) expect(result.endedMentorships).toBeGreaterThanOrEqual(1);
    const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
    expect(person.status).toBe("LEFT");
    expect(person.purgeEligibleAt?.toISOString().slice(0, 10)).toBe("2031-11-01");
    expect(
      await db.appointment.count({ where: { personId, endDate: null, cancelledAt: null } }),
    ).toBe(0);

    // Return of a former volunteer: DIAMANT may not use the TOPAZE status change…
    await expect(
      changePersonStatus(
        db,
        who("topaze"),
        statusChangeSchema.parse({ personId, status: "ACTIVE" }),
        day,
      ),
    ).rejects.toThrow("Le motif du retour est obligatoire.");
    await changePersonStatus(
      db,
      who("topaze"),
      statusChangeSchema.parse({
        personId,
        status: "ACTIVE",
        reason: "Revient dans la région (fictif)",
      }),
      day,
      { onlyReturn: true },
    );
    const back = await db.person.findUniqueOrThrow({ where: { id: personId } });
    expect(back).toMatchObject({ status: "ACTIVE", purgeEligibleAt: null, leftAt: null });
    expect(await db.auditLog.count({ where: { entityId: personId, field: "statusReason" } })).toBe(
      1,
    );
    await expect(
      changePersonStatus(
        db,
        who("topaze"),
        statusChangeSchema.parse({ personId, status: "INACTIVE" }),
        day,
        {
          onlyReturn: true,
        },
      ),
    ).rejects.toThrow(/Seule une personne partie/);
  });

  it("pause keeps its dates; resume clears them; a refused change writes nothing", async () => {
    const p = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE", nivol: { not: null } },
      orderBy: { ref: "desc" },
    });
    // A return planned before the start: refused by the schema, nothing written.
    expect(() =>
      statusChangeSchema.parse({
        personId: p.id,
        status: "PAUSED",
        pausedAt: "2026-11-10",
        pauseUntil: "2026-11-01",
      }),
    ).toThrow(/avant le début de la pause/);
    await changePersonStatus(
      db,
      who("topaze"),
      statusChangeSchema.parse({
        personId: p.id,
        status: "PAUSED",
        pauseUntil: "2027-01-15",
        pauseReason: "Stage (fictif)",
      }),
      day,
    );
    expect(await db.person.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      status: "PAUSED",
      pausedAt: day,
      pauseReason: "Stage (fictif)",
    });
    await changePersonStatus(
      db,
      who("topaze"),
      statusChangeSchema.parse({ personId: p.id, status: "ACTIVE" }),
      day,
    );
    expect(await db.person.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({
      status: "ACTIVE",
      pausedAt: null,
      pauseUntil: null,
    });
  });
});

describe("B3", () => {
  it("one check per civil year; FLAGGED visible to TOPAZE only; reads journaled", async () => {
    const list = await b3ToCheck(db, who("topaze"), day);
    expect(list.length).toBeGreaterThan(0);
    const target = list[0];
    if (!target) throw new Error("b3");
    await expect(
      recordB3Check(db, who("diamant"), {
        personId: target.personId,
        checkedAt: day,
        status: "CLEAR",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await recordB3Check(db, who("topaze"), {
      personId: target.personId,
      checkedAt: day,
      status: "FLAGGED",
    });
    await expect(
      recordB3Check(db, who("topaze"), {
        personId: target.personId,
        checkedAt: new Date("2026-12-01T00:00:00Z"),
        status: "CLEAR",
      }),
    ).rejects.toThrow(/une vérification par année civile/);
    expect((await b3ToCheck(db, who("topaze"), day)).map((p) => p.personId)).not.toContain(
      target.personId,
    );
    const forTopaze = await readPersonSensitive(db, who("topaze"), target.personId, "test");
    expect(forTopaze).toMatchObject({ b3Status: "FLAGGED", b3Restricted: false });
    const before = await db.accessLog.count({ where: { personId: target.personId } });
    const forDiamant = await readPersonSensitive(db, who("diamant"), target.personId, "test").catch(
      () => null,
    );
    if (forDiamant) {
      expect(forDiamant).toMatchObject({ b3Status: null, b3Restricted: true });
      expect(await db.accessLog.count({ where: { personId: target.personId } })).toBe(before + 1);
    }
    // The audit never holds the outcome.
    const audits = await db.auditLog.findMany({
      where: { entityId: target.personId, field: "b3Check" },
    });
    expect(JSON.stringify(audits)).not.toContain("FLAGGED");
  });
});

describe("follow-ups and mentorships", () => {
  it("completing a point plans the next annual one on the entry anniversary", async () => {
    const planned = await db.followUp.findFirstOrThrow({
      where: {
        doneAt: null,
        cancelledAt: null,
        kind: "THREE_MONTHS",
        person: { status: "ACTIVE" },
      },
      include: { person: { select: { entryDate: true } } },
    });
    await db.followUp.updateMany({
      where: { personId: planned.personId, doneAt: null, id: { not: planned.id } },
      data: { cancelledAt: new Date(), cancelReason: "test" },
    });
    const { nextFollowUpId } = await completeFollowUp(
      db,
      who("diamant"),
      {
        followUpId: planned.id,
        doneAt: day,
        conductedById: null,
        summary: "Tout va bien (fictif).",
        nextDate: null,
      },
      day,
    );
    expect(nextFollowUpId).not.toBeNull();
    const next = await db.followUp.findUniqueOrThrow({ where: { id: nextFollowUpId ?? "" } });
    expect(next.kind).toBe("ANNUAL");
    expect(next.scheduledAt?.getTime()).toBeGreaterThan(day.getTime());
    const done = await db.followUp.findUniqueOrThrow({ where: { id: planned.id } });
    expect(done).toMatchObject({
      summary: "Tout va bien (fictif).",
      conductedById: who("diamant").userId,
    });
    await expect(
      completeFollowUp(
        db,
        who("diamant"),
        { followUpId: planned.id, doneAt: day, conductedById: null, summary: null, nextDate: null },
        day,
      ),
    ).rejects.toThrow(/déjà complété/);
  });

  it("board: overdue points; mentorship of 13 months suggested to end; visibility applies", async () => {
    const board = await followUpBoard(db, who("diamant"), { owner: "all" }, day);
    expect(board.every((f) => ["overdue", "week", "month"].includes(f.bucket))).toBe(true);
    const mentorships = await mentorshipBoard(db, who("diamant"), day);
    expect(mentorships.some((m) => m.endSuggested)).toBe(true);
    await expect(followUpBoard(db, who("action"), { owner: "all" }, day)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
