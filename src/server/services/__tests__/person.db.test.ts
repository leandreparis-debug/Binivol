import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import {
  identitySchema,
  nivolCorrectionSchema,
  personListItemSchema,
  statusChangeSchema,
} from "@/lib/personForms";
import { loadActor } from "@/server/auth/loadActor";
import { createDb } from "@/server/db";
import { can } from "@/server/policy/can";
import { loadPersonFacts } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import { readPersonSensitive } from "@/server/sensitive";
import {
  lookupPerson,
  personAppointments,
  personHeader,
  personOverview,
  personReducedHeader,
  personTrainings,
} from "@/server/services/personProfile";
import {
  addYearsUtc,
  archivePersonListItem,
  changePersonStatus,
  correctPersonNivol,
  savePersonListItem,
  updatePersonIdentity,
} from "@/server/services/personWrites";
import { timelineOf } from "@/server/timeline";
import { getTestDb, resolveTestDatabaseUrl } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-04T00:00:00.000Z");
const actors: Record<string, Actor> = {};

function who(key: string): Actor {
  const actor = actors[key];
  if (!actor) throw new Error(key);
  return actor;
}

async function facts(personId: string) {
  const f = await loadPersonFacts(db, personId, day);
  if (!f) throw new Error(personId);
  return f;
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "action", "laser", "format", "format-gp", "diamant"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (!actor) throw new Error(key);
    actors[key] = actor;
  }
}, 180_000);

describe("lookupPerson", () => {
  it("is notFound for an unknown or malformed ref", async () => {
    expect(await lookupPerson(db, who("topaze"), "P-99999")).toEqual({ status: "notFound" });
    expect(await lookupPerson(db, who("topaze"), "../etc")).toEqual({ status: "notFound" });
  });

  it("hides a candidate from ACTION (notFound), and shows her to DIAMANT", async () => {
    const candidate = await db.person.findFirstOrThrow({ where: { status: "CANDIDATE" } });
    expect(await lookupPerson(db, who("action"), candidate.ref)).toEqual({ status: "notFound" });
    expect((await lookupPerson(db, who("diamant"), candidate.ref.toLowerCase())).status).toBe("ok");
  });

  it("is forbidden for a person visible in the directory but out of scope", async () => {
    const people = await db.person.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, ref: true },
    });
    let checked = 0;
    for (const p of people) {
      const f = await facts(p.id);
      if (can(who("format-gp"), "person.full.read", { person: f }).allowed) continue;
      const result = await lookupPerson(db, who("format-gp"), p.ref);
      expect(result.status).toBe("forbidden");
      checked += 1;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe("reduced person page (FORMAT)", () => {
  it("opens with training.read only, header limited to the directory fields", async () => {
    const person = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { ref: "asc" },
    });
    const lookup = await lookupPerson(db, who("format"), person.ref);
    expect(lookup).toMatchObject({ status: "ok", access: "trainings" });
    if (lookup.status !== "ok") throw new Error("lookup");
    const reduced = await personReducedHeader(db, who("format"), lookup.personId, lookup.facts);
    expect(Object.keys(reduced.person).sort()).toEqual(
      [
        "email",
        "firstName",
        "id",
        "isTrainer",
        "lastName",
        "nivol",
        "phone",
        "ref",
        "status",
        "usageName",
        "view",
      ].sort(),
    );
    // No full header, no other tab, no sensitive data for FORMAT.
    await expect(
      personHeader(db, who("format"), lookup.personId, lookup.facts, day),
    ).rejects.toThrow();
    await expect(
      personOverview(db, who("format"), lookup.personId, lookup.facts, 60, day),
    ).rejects.toThrow();
    await expect(
      personAppointments(db, who("format"), lookup.personId, lookup.facts, day),
    ).rejects.toThrow();
    await expect(timelineOf(db, who("format"), lookup.personId, lookup.facts)).rejects.toThrow();
    await expect(
      readPersonSensitive(db, who("format"), lookup.personId, "fiche"),
    ).rejects.toThrow();
    const trainings = await personTrainings(
      db,
      who("format"),
      lookup.personId,
      lookup.facts,
      60,
      day,
    );
    expect(trainings.groups.length).toBeGreaterThanOrEqual(0);
  });

  it("keeps candidates invisible to FORMAT (notFound)", async () => {
    const candidate = await db.person.findFirstOrThrow({ where: { status: "CANDIDATE" } });
    expect(await lookupPerson(db, who("format"), candidate.ref)).toEqual({ status: "notFound" });
  });
});

describe("person page reads", () => {
  it("projects the header without any sensitive field, with the age and permissions", async () => {
    const minor = await db.personSensitive.findFirstOrThrow({
      where: { birthDate: { gt: new Date("2008-11-04T00:00:00.000Z") } },
    });
    const header = await personHeader(
      db,
      who("topaze"),
      minor.personId,
      await facts(minor.personId),
      day,
    );
    expect(header.minor).toBe(true);
    expect(header.age).toBeLessThan(18);
    expect(Object.keys(header.person)).not.toContain("birthDate");
    expect(JSON.stringify(header)).not.toMatch(/street|postalCode|b3Status/);
    expect(header.permissions).toMatchObject({ changeStatus: true, correctNivol: true });
  });

  it("refuses the trainings tab without training.read, and the header without full.read", async () => {
    const people = await db.person.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    for (const p of people) {
      const f = await facts(p.id);
      if (!can(who("format-gp"), "person.full.read", { person: f }).allowed) {
        await expect(personHeader(db, who("format-gp"), p.id, f, day)).rejects.toThrow();
        break;
      }
    }
    const candidate = await db.person.findFirstOrThrow({ where: { status: "CANDIDATE" } });
    await expect(
      personTrainings(db, who("format"), candidate.id, await facts(candidate.id), 60, day),
    ).rejects.toThrow();
  });

  it("groups trainings by category and splits appointments", async () => {
    const record = await db.trainingRecord.findFirstOrThrow({ where: { result: "PASSED" } });
    const f = await facts(record.personId);
    const trainings = await personTrainings(db, who("topaze"), record.personId, f, 60, day);
    expect(trainings.groups.length).toBeGreaterThan(0);
    expect(trainings.groups.flatMap((g) => g.lines).some((l) => l.id === record.id)).toBe(true);
    const total = Object.values(trainings.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(trainings.qualifications.length);

    const appointment = await db.appointment.findFirstOrThrow();
    const split = await personAppointments(
      db,
      who("topaze"),
      appointment.personId,
      await facts(appointment.personId),
      day,
    );
    const all = [...split.active, ...split.past, ...split.cancelled];
    expect(all.map((a) => a.id)).toContain(appointment.id);
  });

  it("reads the overview: lists without archived items, null yes/no stay null", async () => {
    const person = await db.person.findFirstOrThrow({ where: { status: "ACTIVE" } });
    await db.person.update({ where: { id: person.id }, data: { isMember: null } });
    const overview = await personOverview(
      db,
      who("topaze"),
      person.id,
      await facts(person.id),
      60,
      day,
    );
    expect(Array.isArray(overview.skills)).toBe(true);
    const header = await personHeader(db, who("topaze"), person.id, await facts(person.id), day);
    expect(header.person.isMember).toBeNull();
  });

  it("readPersonSensitive from the page writes an access log", async () => {
    const person = await db.person.findFirstOrThrow({ where: { status: "ACTIVE" } });
    const before = await db.accessLog.count({
      where: { personId: person.id, scope: "SENSITIVE_VIEW" },
    });
    await readPersonSensitive(db, who("topaze"), person.id, "fiche");
    expect(
      await db.accessLog.count({
        where: { personId: person.id, scope: "SENSITIVE_VIEW", context: "fiche" },
      }),
    ).toBe(before + 1);
  });

  it("bounds the number of queries of the person page (header + overview)", async () => {
    const queries: string[] = [];
    const counted = createDb(resolveTestDatabaseUrl(), { onQuery: (q) => queries.push(q) });
    try {
      const person = await db.person.findFirstOrThrow({
        where: { status: "ACTIVE" },
        orderBy: { ref: "asc" },
      });
      const lookup = await lookupPerson(counted, who("topaze"), person.ref);
      if (lookup.status !== "ok") throw new Error("lookup");
      const header = await personHeader(counted, who("topaze"), lookup.personId, lookup.facts, day);
      await personOverview(
        counted,
        who("topaze"),
        lookup.personId,
        lookup.facts,
        header.alertDays,
        day,
      );
      expect(queries.length).toBeLessThanOrEqual(20);
      const first = queries.length;
      queries.length = 0;
      // The same page for a person with more trainings costs the same.
      const busy = await db.trainingRecord.groupBy({
        by: ["personId"],
        _count: true,
        orderBy: { _count: { personId: "desc" } },
        take: 1,
      });
      const busyPerson = await db.person.findUniqueOrThrow({
        where: { id: busy[0]?.personId ?? "" },
      });
      const l2 = await lookupPerson(counted, who("topaze"), busyPerson.ref);
      if (l2.status !== "ok") throw new Error("lookup");
      const h2 = await personHeader(counted, who("topaze"), l2.personId, l2.facts, day);
      await personOverview(counted, who("topaze"), l2.personId, l2.facts, h2.alertDays, day);
      expect(queries.length).toBe(first);
    } finally {
      await counted.$disconnect();
    }
  });
});

describe("status change", () => {
  it("LEFT computes purgeEligibleAt, a return clears the departure, both audited", async () => {
    const person = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE", nivol: { not: null } },
      orderBy: { ref: "desc" },
    });
    await changePersonStatus(
      db,
      who("topaze"),
      statusChangeSchema.parse({
        personId: person.id,
        status: "LEFT",
        leftAt: "2026-10-31",
        leftReason: "MOVED",
        leftComment: "Déménagement (fictif)",
      }),
    );
    const left = await db.person.findUniqueOrThrow({ where: { id: person.id } });
    expect(left).toMatchObject({ status: "LEFT", leftReason: "MOVED" });
    expect(left.purgeEligibleAt?.toISOString().slice(0, 10)).toBe("2031-10-31");

    await changePersonStatus(
      db,
      who("topaze"),
      statusChangeSchema.parse({ personId: person.id, status: "ACTIVE" }),
    );
    const back = await db.person.findUniqueOrThrow({ where: { id: person.id } });
    expect(back).toMatchObject({
      status: "ACTIVE",
      leftAt: null,
      leftReason: null,
      purgeEligibleAt: null,
    });

    const statusAudit = await db.auditLog.findMany({
      where: { entity: "Person", entityId: person.id, field: "status" },
      orderBy: { at: "asc" },
    });
    expect(statusAudit.map((a) => [a.oldValue, a.newValue])).toEqual([
      ["ACTIVE", "LEFT"],
      ["LEFT", "ACTIVE"],
    ]);
    const timeline = await timelineOf(db, who("topaze"), person.id, await facts(person.id));
    expect(timeline.filter((e) => e.type === "status").map((e) => e.title)).toEqual([
      "Statut : Parti(e) → Actif",
      "Statut : Actif → Parti(e)",
    ]);
  });

  it("refuses LEFT without date and reason (schema), and ACTIVE without NIVOL", async () => {
    const parsed = statusChangeSchema.safeParse({ personId: "x", status: "LEFT" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.join("."))).toEqual(["leftAt", "leftReason"]);

    const created = await db.person.create({
      data: {
        firstName: "Sans",
        lastName: "Nivol (fictif)",
        status: "INACTIVE",
        notes: "Donnée fictive (seed)",
      },
    });
    await expect(
      changePersonStatus(
        db,
        who("topaze"),
        statusChangeSchema.parse({ personId: created.id, status: "ACTIVE" }),
      ),
    ).rejects.toMatchObject({ code: "NIVOL_REQUIRED" });
    expect((await db.person.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "INACTIVE",
    );
    // An imported person may become active without NIVOL.
    await db.person.update({ where: { id: created.id }, data: { legacyImport: true } });
    await changePersonStatus(
      db,
      who("topaze"),
      statusChangeSchema.parse({ personId: created.id, status: "ACTIVE" }),
    );
    expect((await db.person.findUniqueOrThrow({ where: { id: created.id } })).status).toBe(
      "ACTIVE",
    );
  });

  it("refuses to change a candidate here", async () => {
    const candidate = await db.person.findFirstOrThrow({ where: { status: "CANDIDATE" } });
    await expect(
      changePersonStatus(
        db,
        who("topaze"),
        statusChangeSchema.parse({ personId: candidate.id, status: "PAUSED" }),
      ),
    ).rejects.toThrow(/intégration/);
  });
});

describe("identity, NIVOL and lists", () => {
  it("updates identity with a normalised phone, audited field by field", async () => {
    const person = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { ref: "asc" },
    });
    await updatePersonIdentity(
      db,
      who("topaze"),
      identitySchema.parse({
        personId: person.id,
        firstName: person.firstName,
        lastName: person.lastName,
        phone: "+33 6 39 98 77 66",
        email: "Nouvelle.Adresse@Exemple.TEST",
      }),
    );
    const after = await db.person.findUniqueOrThrow({ where: { id: person.id } });
    expect(after).toMatchObject({ phone: "0639987766", email: "nouvelle.adresse@exemple.test" });
    expect(
      await db.auditLog.count({
        where: { entity: "Person", entityId: person.id, field: "phone", action: "UPDATE" },
      }),
    ).toBe(1);
  });

  it("corrects the NIVOL with a duplicate check and the reason in the audit", async () => {
    const [a, b] = await db.person.findMany({
      where: { nivol: { not: null } },
      orderBy: { ref: "asc" },
      take: 2,
    });
    if (!a || !b) throw new Error("seed");
    await expect(
      correctPersonNivol(
        db,
        who("topaze"),
        nivolCorrectionSchema.parse({ personId: a.id, nivol: b.nivol, reason: "x" }),
      ),
    ).rejects.toMatchObject({ code: "NIVOL_TAKEN" });
    await correctPersonNivol(
      db,
      who("topaze"),
      nivolCorrectionSchema.parse({
        personId: a.id,
        nivol: "000 9988 7766 z",
        reason: "Erreur de saisie (fictif)",
      }),
    );
    expect((await db.person.findUniqueOrThrow({ where: { id: a.id } })).nivol).toBe("00099887766Z");
    const entry = await db.auditLog.findFirstOrThrow({
      where: { entity: "Person", entityId: a.id, field: "nivol" },
      orderBy: { at: "desc" },
    });
    expect(entry.newValue).toEqual({ value: "00099887766Z", reason: "Erreur de saisie (fictif)" });
    expect(
      nivolCorrectionSchema.safeParse({ personId: a.id, nivol: "12345", reason: "x" }).success,
    ).toBe(false);
  });

  it("adds, edits and archives annexes, skills, languages and licences (never deleted)", async () => {
    const person = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE" },
      orderBy: { ref: "asc" },
    });
    const save = (input: unknown) =>
      savePersonListItem(db, who("topaze"), personListItemSchema.parse(input));
    await save({
      list: "annex",
      personId: person.id,
      code: "vpsp chauffeur",
      label: "Chauffeur VPSP",
      validUntil: "2027-06-30",
    });
    const annex = await db.personAnnex.findFirstOrThrow({
      where: { personId: person.id, code: "VPSP_CHAUFFEUR" },
    });
    await save({
      list: "annex",
      personId: person.id,
      id: annex.id,
      code: "VPSP_CHAUFFEUR",
      label: "Chauffeur VPSP",
      validUntil: "",
    });
    expect(
      (await db.personAnnex.findUniqueOrThrow({ where: { id: annex.id } })).validUntil,
    ).toBeNull();
    await archivePersonListItem(db, who("topaze"), {
      personId: person.id,
      list: "annex",
      id: annex.id,
    });
    expect(
      (await db.personAnnex.findUniqueOrThrow({ where: { id: annex.id } })).archivedAt,
    ).not.toBeNull();
    const overview = await personOverview(
      db,
      who("topaze"),
      person.id,
      await facts(person.id),
      60,
      day,
    );
    expect(overview.annexes.map((a) => a.id)).not.toContain(annex.id);

    await save({ list: "license", personId: person.id, category: "c1" });
    await expect(save({ list: "license", personId: person.id, category: "C1" })).rejects.toThrow(
      /déjà indiqué/,
    );
    const license = await db.personLicense.findFirstOrThrow({
      where: { personId: person.id, category: "C1" },
    });
    await archivePersonListItem(db, who("topaze"), {
      personId: person.id,
      list: "license",
      id: license.id,
    });
    await save({ list: "license", personId: person.id, category: "C1" });
    expect(
      (await db.personLicense.findUniqueOrThrow({ where: { id: license.id } })).archivedAt,
    ).toBeNull();

    await save({
      list: "skill",
      personId: person.id,
      label: "Logistique (fictif)",
      level: "EXPERT",
    });
    await save({ list: "language", personId: person.id, label: "Anglais", level: "FLUENT" });
    expect(
      await db.auditLog.count({ where: { entity: "PersonAnnex", entityId: annex.id } }),
    ).toBeGreaterThanOrEqual(3);
    await expect(
      archivePersonListItem(db, who("topaze"), { personId: person.id, list: "skill", id: "nope" }),
    ).rejects.toThrow(/introuvable/);
  });
});

describe("timelineOf", () => {
  it("shows each kind of event only with the matching right", async () => {
    const record = await db.trainingRecord.findFirstOrThrow({
      where: { person: { status: "ACTIVE" } },
    });
    const f = await facts(record.personId);
    const topaze = await timelineOf(db, who("topaze"), record.personId, f);
    expect(topaze.some((e) => e.type === "training")).toBe(true);
    // FORMAT_GP or LASER without full.read cannot get the timeline at all.
    for (const key of ["action", "laser", "format-gp", "diamant"]) {
      const actor = who(key);
      if (!can(actor, "person.full.read", { person: f }).allowed) {
        await expect(timelineOf(db, actor, record.personId, f)).rejects.toThrow();
        continue;
      }
      const events = await timelineOf(db, actor, record.personId, f);
      const types = new Set(events.map((e) => e.type));
      if (!can(actor, "training.read", { person: f }).allowed)
        expect(types.has("training")).toBe(false);
      if (!can(actor, "followUp.manage", { person: f }).allowed)
        expect(types.has("followUp")).toBe(false);
      if (!can(actor, "document.read", { person: f }).allowed)
        expect(types.has("document")).toBe(false);
      if (!can(actor, "candidacy.manage", { person: f }).allowed)
        expect(types.has("candidacy")).toBe(false);
    }
  });

  it("puts events without date last", async () => {
    const appointment = await db.appointment.findFirstOrThrow();
    await db.appointment.update({ where: { id: appointment.id }, data: { startDate: null } });
    const events = await timelineOf(
      db,
      who("topaze"),
      appointment.personId,
      await facts(appointment.personId),
    );
    const undated = events.findIndex((e) => e.date === null);
    expect(undated).toBeGreaterThanOrEqual(0);
    expect(events.slice(undated).every((e) => e.date === null)).toBe(true);
  });
});

describe("addYearsUtc", () => {
  it("keeps 29 February on a leap year and falls back to 28 otherwise", () => {
    const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
    expect(addYearsUtc(d("2024-02-29"), 5).toISOString().slice(0, 10)).toBe("2029-02-28");
    expect(addYearsUtc(d("2024-02-29"), 4).toISOString().slice(0, 10)).toBe("2028-02-29");
  });
});
