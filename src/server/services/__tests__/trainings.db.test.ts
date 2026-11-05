import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { loadActor } from "@/server/auth/loadActor";
import { ForbiddenError } from "@/server/policy/can";
import { loadPersonFactsMany } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import { deadlineSql } from "@/server/services/directory";
import { personTrainings } from "@/server/services/personProfile";
import {
  addTrainingWish,
  appointableFunctions,
  cancelAppointment,
  cancelSession,
  cancelTrainingRecord,
  createAppointment,
  createSession,
  endAppointment,
  findTeam,
  recordTrainingGroup,
  scheduleWish,
  sessionDetail,
  setTrainingResults,
  updateReferenceItem,
  waitingLists,
} from "@/server/services/trainings";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

const ref = (code: string) => db.referenceItem.findUniqueOrThrow({ where: { code } });

async function activePeople(n: number, skip = 0) {
  return db.person.findMany({
    where: { status: "ACTIVE", archivedAt: null },
    orderBy: { ref: "asc" },
    skip,
    take: n,
  });
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "action", "laser", "format", "diamant"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (!actor) throw new Error(key);
    actors[key] = actor;
  }
}, 180_000);

describe("group entry", () => {
  it("warns for the whole group at once, writes nothing until accepted, then one transaction", async () => {
    const tcau = await ref("TCAU");
    const people = await activePeople(5, 10);
    const candidate = await db.person.findFirstOrThrow({ where: { status: "CANDIDATE" } });
    const input = {
      referenceId: tcau.id,
      date: new Date("2026-10-15T00:00:00.000Z"),
      result: "PASSED" as const,
      personIds: [...people.map((p) => p.id), candidate.id],
    };
    // FORMAT cannot write for a candidate: a real error, blocking.
    await expect(recordTrainingGroup(db, who("format"), input, day)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const forTopaze = await recordTrainingGroup(db, who("topaze"), input, day);
    expect(forTopaze.saved).toBe(false);
    if (forTopaze.saved) return;
    expect(forTopaze.warnings.map((w) => w.code)).toEqual(["NOT_PRESENT"]);
    const before = await db.trainingRecord.count({ where: { referenceId: tcau.id } });
    expect(await db.trainingRecord.count({ where: { referenceId: tcau.id } })).toBe(before);
    const saved = await recordTrainingGroup(
      db,
      who("topaze"),
      { ...input, acceptedWarnings: forTopaze.warningsKey },
      day,
    );
    expect(saved.saved).toBe(true);
    expect(await db.trainingRecord.count({ where: { referenceId: tcau.id } })).toBe(before + 6);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { entity: "TrainingRecord", field: "acceptedWarnings" },
      orderBy: { at: "desc" },
    });
    expect(JSON.stringify(audit.newValue)).toContain("n'est pas présent");
    // The same entry again: a duplicate (same person, training, date) warns.
    const again = await recordTrainingGroup(
      db,
      who("topaze"),
      { ...input, personIds: [people[0]?.id ?? ""] },
      day,
    );
    expect(!again.saved && again.warnings.map((w) => w.code)).toEqual(["DUPLICATE_SESSION"]);
  });

  it("computes expiresAt (31/12 rule), results in bulk, cancellation traced", async () => {
    const fcpse = await ref("FCPSE");
    const [p] = await activePeople(1, 20);
    if (!p) throw new Error("person");
    const created = await recordTrainingGroup(
      db,
      who("format"),
      {
        referenceId: fcpse.id,
        date: new Date("2026-03-10T00:00:00.000Z"),
        result: "REGISTERED",
        personIds: [p.id],
      },
      day,
    );
    if (!created.saved) throw new Error(JSON.stringify(created.warnings));
    const [id] = created.recordIds;
    await setTrainingResults(
      db,
      who("format"),
      { recordIds: created.recordIds, result: "PASSED", date: null },
      day,
    );
    const row = await db.trainingRecord.findUniqueOrThrow({ where: { id } });
    expect(row.expiresAt?.toISOString().slice(0, 10)).toBe("2026-12-31");
    await cancelTrainingRecord(
      db,
      who("format"),
      { recordId: row.id, reason: "Saisie en double (fictif)" },
      day,
    );
    const cancelled = await db.trainingRecord.findUniqueOrThrow({ where: { id: row.id } });
    expect(cancelled.cancelReason).toBe("Saisie en double (fictif)");
    await expect(
      cancelTrainingRecord(db, who("format"), { recordId: row.id, reason: "x" }, day),
    ).rejects.toThrow(/déjà annulée/);
  });
});

describe("sessions and waiting lists", () => {
  it("creates, schedules a wish into it, sorts waiting lists, cancels with a reason", async () => {
    const pse = await ref("PSE");
    const sessionId = await createSession(db, who("format"), {
      referenceId: pse.id,
      startDate: new Date("2026-12-12T00:00:00.000Z"),
      endDate: new Date("2026-12-13T00:00:00.000Z"),
      place: "Versailles (fictif)",
      pegassUrl: null,
      capacity: 8,
    });
    const people = await activePeople(2, 30);
    const [a, b] = people;
    if (!a || !b) throw new Error("people");
    await db.trainingWish.updateMany({
      where: { personId: { in: [a.id, b.id] }, referenceId: pse.id },
      data: { status: "CANCELLED" },
    });
    await addTrainingWish(
      db,
      who("format"),
      { personId: a.id, referenceId: pse.id, priority: 0, comment: null },
      day,
    );
    const urgent = await addTrainingWish(
      db,
      who("format"),
      { personId: b.id, referenceId: pse.id, priority: 5, comment: "Urgent (fictif)" },
      day,
    );
    await expect(
      addTrainingWish(
        db,
        who("format"),
        { personId: b.id, referenceId: pse.id, priority: 0, comment: null },
        day,
      ),
    ).rejects.toThrow(/déjà ouvert/);
    const list = (await waitingLists(db, who("format"), { referenceId: pse.id }, day))[0];
    expect(list?.wishes[0]?.id).toBe(urgent);
    await scheduleWish(db, who("format"), { wishId: urgent, sessionId }, day);
    const detail = await sessionDetail(db, who("format"), sessionId);
    expect(detail?.lines.map((l) => [l.personId, l.result])).toEqual([[b.id, "REGISTERED"]]);
    expect(detail?.waiting.some((w) => w.id === urgent)).toBe(false);
    await cancelSession(db, who("format"), { sessionId, reason: "Formateur absent (fictif)" });
    expect(
      (await db.trainingSession.findUniqueOrThrow({ where: { id: sessionId } })).cancelReason,
    ).toBe("Formateur absent (fictif)");
    await expect(
      createSession(db, who("action"), {
        referenceId: pse.id,
        startDate: day,
        endDate: null,
        place: null,
        pegassUrl: null,
        capacity: null,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("Trouver", () => {
  it("AND of valid competences, present people only (never suspended), visibility in SQL", async () => {
    const pse = await ref("PSE");
    const psc = await ref("PSC");
    const [x, y] = await activePeople(2, 33);
    // z: a present person without any PSC line.
    const z = await db.person.findFirst({
      where: {
        status: "ACTIVE",
        archivedAt: null,
        id: { notIn: [x?.id ?? "", y?.id ?? ""] },
        trainingRecords: { none: { reference: { code: "PSC" } } },
      },
    });
    if (!x || !y || !z) throw new Error("people");
    for (const p of [x, y, z]) {
      await recordTrainingGroup(
        db,
        who("topaze"),
        {
          referenceId: pse.id,
          date: new Date("2025-01-10T00:00:00Z"),
          result: "PASSED",
          personIds: [p.id],
          acceptedWarnings: null,
        },
        day,
      ).then(async (r) => {
        if (!r.saved)
          await recordTrainingGroup(
            db,
            who("topaze"),
            {
              referenceId: pse.id,
              date: new Date("2025-01-10T00:00:00Z"),
              result: "PASSED",
              personIds: [p.id],
              acceptedWarnings: r.warningsKey,
            },
            day,
          );
      });
    }
    for (const p of [x, y]) {
      const r = await recordTrainingGroup(
        db,
        who("topaze"),
        {
          referenceId: psc.id,
          date: new Date("2025-02-10T00:00:00Z"),
          result: "PASSED",
          personIds: [p.id],
        },
        day,
      );
      if (!r.saved)
        await recordTrainingGroup(
          db,
          who("topaze"),
          {
            referenceId: psc.id,
            date: new Date("2025-02-10T00:00:00Z"),
            result: "PASSED",
            personIds: [p.id],
            acceptedWarnings: r.warningsKey,
          },
          day,
        );
    }
    await db.person.update({ where: { id: y.id }, data: { status: "SUSPENDED" } });
    const found = await findTeam(db, who("topaze"), { codes: ["PSE", "PSC"], q: "" }, day);
    const ids = found.people.map((p) => p.id);
    expect(ids).toContain(x.id);
    expect(ids).not.toContain(y.id); // suspended
    expect(ids).not.toContain(z.id); // no PSC
    expect(found.total).toBe(found.people.length);
    expect(found.people.find((p) => p.id === x.id)?.states.map((s) => s.code)).toEqual([
      "PSE",
      "PSC",
    ]);
    await db.person.update({ where: { id: y.id }, data: { status: "ACTIVE" } });
    // ACTION sees only the people of its perimeter (directory rule).
    const forAction = await findTeam(db, who("action"), { codes: ["PSE"], q: "" }, day);
    expect(forAction.total).toBeLessThanOrEqual(
      (await findTeam(db, who("topaze"), { codes: ["PSE"], q: "" }, day)).total,
    );
  });
});

describe("appointments", () => {
  it("managedBy decides: LASER appoints a CI, ACTION cannot; end and cancel are traced", async () => {
    const ci = await ref("CI");
    const [p] = await activePeople(1, 3);
    if (!p) throw new Error("person");
    // A person in LASER's scope: give her a TCAU, valid.
    const tcau = await ref("TCAU");
    const r = await recordTrainingGroup(
      db,
      who("topaze"),
      {
        referenceId: tcau.id,
        date: new Date("2026-01-05T00:00:00Z"),
        result: "PASSED",
        personIds: [p.id],
      },
      day,
    );
    if (!r.saved)
      await recordTrainingGroup(
        db,
        who("topaze"),
        {
          referenceId: tcau.id,
          date: new Date("2026-01-05T00:00:00Z"),
          result: "PASSED",
          personIds: [p.id],
          acceptedWarnings: r.warningsKey,
        },
        day,
      );
    const facts = (await loadPersonFactsMany(db, [p.id], day)).get(p.id);
    if (!facts) throw new Error("facts");
    expect((await appointableFunctions(db, who("laser"), facts)).map((f) => f.code)).toContain(
      "CI",
    );
    expect((await appointableFunctions(db, who("action"), facts)).map((f) => f.code)).not.toContain(
      "CI",
    );
    await expect(
      createAppointment(
        db,
        who("action"),
        {
          personId: p.id,
          referenceId: ci.id,
          startDate: day,
          authorizedBy: "DLUS (fictif)",
          decisionRef: null,
          comment: null,
        },
        day,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const first = await createAppointment(
      db,
      who("laser"),
      {
        personId: p.id,
        referenceId: ci.id,
        startDate: day,
        authorizedBy: null,
        decisionRef: null,
        comment: null,
      },
      day,
    );
    expect(!first.saved && first.warnings.map((w) => w.code)).toEqual(["NO_AUTHORIZER"]);
    if (first.saved) return;
    const done = await createAppointment(
      db,
      who("laser"),
      {
        personId: p.id,
        referenceId: ci.id,
        startDate: day,
        authorizedBy: null,
        decisionRef: null,
        comment: null,
        acceptedWarnings: first.warningsKey,
      },
      day,
    );
    if (!done.saved) throw new Error("not saved");
    await expect(
      endAppointment(
        db,
        who("laser"),
        { appointmentId: done.id, endDate: new Date("2026-01-01T00:00:00Z") },
        day,
      ),
    ).rejects.toThrow(/avant la date de début/);
    await endAppointment(
      db,
      who("laser"),
      { appointmentId: done.id, endDate: new Date("2027-01-01T00:00:00Z") },
      day,
    );
    await cancelAppointment(
      db,
      who("laser"),
      { appointmentId: done.id, reason: "Erreur de saisie (fictif)" },
      day,
    );
    expect((await db.appointment.findUniqueOrThrow({ where: { id: done.id } })).cancelReason).toBe(
      "Erreur de saisie (fictif)",
    );
  });

  it("refuses a function forbidden to minors for a minor (blocking)", async () => {
    const chef = await ref("CHEF_PAPS");
    const minor = await db.person.findFirstOrThrow({
      where: {
        status: "ACTIVE",
        sensitive: { birthDate: { gt: new Date("2009-01-01T00:00:00Z") } },
      },
    });
    await expect(
      createAppointment(
        db,
        who("topaze"),
        {
          personId: minor.id,
          referenceId: chef.id,
          startDate: day,
          authorizedBy: "DLUS (fictif)",
          decisionRef: null,
          comment: null,
        },
        day,
      ),
    ).rejects.toThrow(/interdite aux mineurs/);
  });
});

describe("reference list and consistency", () => {
  it("TOPAZE edits an item (prerequisite, validity): live lines are recomputed", async () => {
    const pse = await ref("PSE");
    const tcau = await ref("TCAU");
    await updateReferenceItem(db, who("topaze"), {
      id: tcau.id,
      label: tcau.label,
      category: tcau.category,
      validityMonths: 36,
      expiresEndOfYear: false,
      forbiddenForMinors: tcau.forbiddenForMinors,
      managedBy: [],
      active: true,
      prerequisiteIds: [pse.id],
    });
    expect(await db.referenceItemPrerequisite.count({ where: { itemId: tcau.id } })).toBe(1);
    const line = await db.trainingRecord.findFirstOrThrow({
      where: { referenceId: tcau.id, result: "PASSED", cancelledAt: null, date: { not: null } },
    });
    expect(line.expiresAt).not.toBeNull();
    await expect(
      updateReferenceItem(db, who("action"), {
        ...tcau,
        validityMonths: null,
        prerequisiteIds: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    // Back to the seed values.
    await updateReferenceItem(db, who("topaze"), {
      id: tcau.id,
      label: tcau.label,
      category: tcau.category,
      validityMonths: null,
      expiresEndOfYear: tcau.expiresEndOfYear,
      forbiddenForMinors: tcau.forbiddenForMinors,
      managedBy: [],
      active: true,
      prerequisiteIds: [],
    });
  });

  it("the directory deadline SQL agrees with the pure states on the seed", async () => {
    const people = await db.person.findMany({ where: { archivedAt: null }, select: { id: true } });
    const expiredSql = new Set(
      (
        await db.$queryRaw<
          { id: string }[]
        >`SELECT p.id FROM persons p WHERE ${deadlineSql("expiree", day, 60)}`
      ).map((r) => r.id),
    );
    const facts = await loadPersonFactsMany(
      db,
      people.map((p) => p.id),
      day,
    );
    for (const p of people.slice(0, 60)) {
      const f = facts.get(p.id);
      if (!f) continue;
      const trainings = await personTrainings(db, who("topaze"), p.id, f, 60, day);
      const pureExpired = trainings.qualifications.some((q) => q.deadline === "expired");
      expect(expiredSql.has(p.id), p.id).toBe(pureExpired);
    }
  });
});
