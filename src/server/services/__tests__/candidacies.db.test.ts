import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail, USERS } from "../../../../prisma/seed/index";
import {
  assignMentorSchema,
  finalizeSchema,
  newCandidateSchema,
  stageChangeSchema,
} from "@/lib/candidacyForms";
import { loadActor } from "@/server/auth/loadActor";
import { can } from "@/server/policy/can";
import { loadPersonFactsMany } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import {
  assignMentor,
  candidacyBoard,
  changeStage,
  createCandidate,
  endMentorship,
  finalizeCandidacy,
  integrationTab,
  mentorSuggestions,
  overdueCandidacies,
  reengagePerson,
} from "@/server/services/candidacies";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-05T00:00:00.000Z");
const actors: Record<string, Actor> = {};
let counter = 0;

function who(key: string): Actor {
  const actor = actors[key];
  if (!actor) throw new Error(key);
  return actor;
}

/** A unique fictitious candidate. */
function candidate(over: Record<string, unknown> = {}) {
  counter += 1;
  return newCandidateSchema.parse({
    firstName: `Prénom${String(counter)}`,
    lastName: `Fictif${String(counter)}`,
    email: `candidat${String(counter)}@exemple.test`,
    source: "Site internet",
    ...over,
  });
}

async function created(input = candidate(), actor = who("diamant")) {
  const outcome = await createCandidate(db, actor, input, day);
  if (outcome.status !== "created") throw new Error("duplicates");
  return outcome;
}

async function move(
  candidacyId: string,
  from: string,
  to: string,
  extra: Record<string, unknown> = {},
) {
  await changeStage(
    db,
    who("diamant"),
    stageChangeSchema.parse({ candidacyId, expectedStage: from, toStage: to, ...extra }),
    day,
  );
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const u of USERS) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(u.key) } });
    const actor = await loadActor(db, user.id);
    if (!actor) throw new Error(u.key);
    actors[u.key] = actor;
  }
}, 180_000);

describe("creation and duplicates", () => {
  it("creates a candidate: person CANDIDATE, candidacy FIRST_CONTACT, first event, audit", async () => {
    const outcome = await created(candidate({ note: "Rencontré au forum (fictif)." }));
    const c = await db.candidacy.findUniqueOrThrow({
      where: { id: outcome.candidacyId },
      include: { person: true, events: true },
    });
    expect(c).toMatchObject({
      stage: "FIRST_CONTACT",
      ownerId: who("diamant").userId,
      closedAt: null,
    });
    expect(c.person.status).toBe("CANDIDATE");
    expect(c.events.map((e) => [e.fromStage, e.toStage, e.note])).toEqual([
      [null, "FIRST_CONTACT", "Rencontré au forum (fictif)."],
    ]);
    expect(c.followUpAt?.toISOString().slice(0, 10)).toBe("2026-11-12");
    expect(
      await db.auditLog.count({ where: { entity: "Candidacy", entityId: c.id, action: "CREATE" } }),
    ).toBe(1);
  });

  it("refuses a candidate with neither e-mail nor phone", () => {
    const parsed = newCandidateSchema.safeParse({ firstName: "A", lastName: "B" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe("Indiquez au moins un e-mail ou un téléphone.");
  });

  it("finds duplicates by e-mail, phone and name (accents, case), across statuses", async () => {
    const first = await created(
      candidate({ firstName: "Éloïse", lastName: "Doublon", phone: "06 39 98 55 01" }),
    );
    const byEmail = await createCandidate(
      db,
      who("diamant"),
      candidate({
        email: (await db.person.findUniqueOrThrow({ where: { id: first.personId } })).email,
      }),
      day,
    );
    const byPhone = await createCandidate(
      db,
      who("diamant"),
      candidate({ phone: "+33639985501" }),
      day,
    );
    const byName = await createCandidate(
      db,
      who("diamant"),
      candidate({ firstName: "eloise", lastName: "DOUBLON" }),
      day,
    );
    for (const [outcome, on] of [
      [byEmail, "email"],
      [byPhone, "phone"],
      [byName, "name"],
    ] as const) {
      expect(outcome.status).toBe("duplicates");
      if (outcome.status !== "duplicates") continue;
      expect(outcome.matches).toEqual([
        expect.objectContaining({
          visible: true,
          personId: first.personId,
          matchedOn: [on],
          openCandidacy: true,
        }),
      ]);
    }
  });

  it("« Créer quand même » creates and records the choice in the audit", async () => {
    const first = await created(candidate({ firstName: "Homonyme", lastName: "Fictif" }));
    const again = candidate({ firstName: "Homonyme", lastName: "Fictif" });
    const refused = await createCandidate(db, who("diamant"), again, day);
    expect(refused.status).toBe("duplicates");
    const outcome = await createCandidate(
      db,
      who("diamant"),
      { ...again, confirmDuplicates: [first.personId] },
      day,
    );
    expect(outcome.status).toBe("created");
    if (outcome.status !== "created") return;
    const entry = await db.auditLog.findFirstOrThrow({
      where: { entity: "Person", entityId: outcome.personId, field: "duplicateOverride" },
    });
    expect(entry.newValue).toEqual({ createdDespite: [first.personId] });
  });

  it("reports a match the actor cannot see without any field", async () => {
    const hidden = await created(candidate({ firstName: "Invisible", lastName: "Fictif" }));
    const formatOnly: Actor = { ...who("format"), profiles: new Set(["FORMAT"]) };
    const outcome = await createCandidate(
      db,
      formatOnly,
      candidate({ firstName: "Invisible", lastName: "Fictif" }),
      day,
    );
    expect(outcome).toEqual({
      status: "duplicates",
      matches: [{ visible: false, personId: hidden.personId }],
    });
  });

  it("says an active volunteer is already one, and offers re-engagement for a person who left", async () => {
    const active = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE", email: { not: null } },
    });
    const left = await db.person.findFirstOrThrow({
      where: { status: "LEFT", email: { not: null }, candidacies: { none: { closedAt: null } } },
    });
    const a = await createCandidate(db, who("topaze"), candidate({ email: active.email }), day);
    const l = await createCandidate(db, who("topaze"), candidate({ email: left.email }), day);
    expect(a.status === "duplicates" && a.matches[0]).toMatchObject({
      alreadyVolunteer: true,
      canReengage: false,
    });
    expect(l.status === "duplicates" && l.matches[0]).toMatchObject({
      canReengage: true,
      alreadyVolunteer: false,
    });
  });
});

describe("changes of stage", () => {
  it("writes one event and one audit entry per change, in the same transaction", async () => {
    const { candidacyId } = await created();
    await move(candidacyId, "FIRST_CONTACT", "CONFIRMED"); // jump allowed up to CONFIRMED
    await move(candidacyId, "CONFIRMED", "FILE");
    await move(candidacyId, "FILE", "MEETING", { note: "Le dossier attendra (fictif)." });
    const events = await db.candidacyEvent.findMany({
      where: { candidacyId },
      orderBy: { at: "asc" },
    });
    expect(events.map((e) => `${e.fromStage ?? "∅"}→${e.toStage}`)).toEqual([
      "∅→FIRST_CONTACT",
      "FIRST_CONTACT→CONFIRMED",
      "CONFIRMED→FILE",
      "FILE→MEETING",
    ]);
    const stageAudit = await db.auditLog.count({
      where: { entity: "Candidacy", entityId: candidacyId, field: "stage" },
    });
    expect(stageAudit).toBe(3);
  });

  it("refuses what the machine refuses, called directly, and writes nothing", async () => {
    const { candidacyId } = await created();
    const before = await db.candidacyEvent.count({ where: { candidacyId } });
    await expect(
      changeStage(
        db,
        who("diamant"),
        stageChangeSchema.parse({ candidacyId, expectedStage: "FIRST_CONTACT", toStage: "FILE" }),
        day,
      ),
    ).rejects.toMatchObject({
      code: "TRANSITION_REFUSED",
      message: expect.stringMatching(/juste avant/) as string,
    });
    await expect(
      changeStage(
        db,
        who("diamant"),
        stageChangeSchema.parse({ candidacyId, expectedStage: "FIRST_CONTACT", toStage: "DONE" }),
        day,
      ),
    ).rejects.toMatchObject({ code: "TRANSITION_REFUSED" });
    await move(candidacyId, "FIRST_CONTACT", "MEETING");
    await expect(
      changeStage(
        db,
        who("diamant"),
        stageChangeSchema.parse({
          candidacyId,
          expectedStage: "MEETING",
          toStage: "FIRST_CONTACT",
        }),
        day,
      ),
    ).rejects.toThrow(/note est obligatoire/);
    await expect(
      changeStage(
        db,
        who("diamant"),
        stageChangeSchema.parse({ candidacyId, expectedStage: "MEETING", toStage: "ABANDONED" }),
        day,
      ),
    ).rejects.toThrow(/motif d'abandon/);
    expect(await db.candidacyEvent.count({ where: { candidacyId } })).toBe(before + 1);
  });

  it("refuses the second of two concurrent changes (expected stage)", async () => {
    const { candidacyId } = await created();
    await move(candidacyId, "FIRST_CONTACT", "MEETING");
    await expect(move(candidacyId, "FIRST_CONTACT", "MEETING")).rejects.toMatchObject({
      code: "STALE_CANDIDACY",
      message: "La candidature a changé entre-temps : rechargez la page.",
    });
    // Truly concurrent: only one of the two passes.
    const results = await Promise.allSettled([
      move(candidacyId, "MEETING", "CONFIRMED"),
      move(candidacyId, "MEETING", "CONFIRMED"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.candidacyEvent.count({ where: { candidacyId, toStage: "CONFIRMED" } })).toBe(1);
  });

  it("abandons with a reason, then resumes at the stage of the abandonment", async () => {
    const { candidacyId } = await created();
    await move(candidacyId, "FIRST_CONTACT", "MEETING");
    await move(candidacyId, "MEETING", "ABANDONED", {
      abandonReason: "NO_RESPONSE",
      note: "Plus de nouvelles (fictif).",
    });
    const abandoned = await db.candidacy.findUniqueOrThrow({ where: { id: candidacyId } });
    expect(abandoned).toMatchObject({ stage: "ABANDONED", abandonReason: "NO_RESPONSE" });
    expect(abandoned.closedAt).not.toBeNull();
    await expect(move(candidacyId, "ABANDONED", "FIRST_CONTACT")).rejects.toMatchObject({
      code: "TRANSITION_REFUSED",
    });
    await move(candidacyId, "ABANDONED", "MEETING");
    const resumed = await db.candidacy.findUniqueOrThrow({ where: { id: candidacyId } });
    expect(resumed).toMatchObject({ stage: "MEETING", closedAt: null, abandonReason: null });
    expect(
      await db.candidacyEvent.count({
        where: { candidacyId, fromStage: "ABANDONED", toStage: "MEETING" },
      }),
    ).toBe(1);
  });

  it("refuses a second open candidacy for the same person with a clear message", async () => {
    const { candidacyId, personId } = await created();
    await move(candidacyId, "FIRST_CONTACT", "ABANDONED", { abandonReason: "OTHER" });
    await db.person.update({ where: { id: personId }, data: { status: "INACTIVE" } });
    await reengagePerson(
      db,
      who("diamant"),
      { personId, source: null, interest: null, note: null },
      day,
    );
    await expect(move(candidacyId, "ABANDONED", "FIRST_CONTACT")).rejects.toMatchObject({
      code: "CANDIDACY_ALREADY_OPEN",
      message: "Cette personne a déjà une candidature en cours.",
    });
  });
});

async function toGaia(candidacyId: string) {
  await move(candidacyId, "FIRST_CONTACT", "CONFIRMED");
  await move(candidacyId, "CONFIRMED", "FILE");
  await move(candidacyId, "FILE", "GAIA");
}

describe("finalisation", () => {
  it("activates the person, closes the candidacy, plans the 3-month follow-up, audits", async () => {
    const { candidacyId, personId } = await created();
    await toGaia(candidacyId);
    const input = finalizeSchema.parse({
      candidacyId,
      nivol: " 000 9977 0001 a ",
      crfEmail: "prenom.fictif@croix-rouge.fr",
      entryDate: "2026-11-05",
    });
    expect(input.nivol).toBe("00099770001A");
    const result = await finalizeCandidacy(db, who("diamant"), input);
    const person = await db.person.findUniqueOrThrow({ where: { id: personId } });
    expect(person).toMatchObject({
      status: "ACTIVE",
      nivol: "00099770001A",
      crfEmail: "prenom.fictif@croix-rouge.fr",
    });
    expect(person.entryDate?.toISOString().slice(0, 10)).toBe("2026-11-05");
    const candidacy = await db.candidacy.findUniqueOrThrow({ where: { id: candidacyId } });
    expect(candidacy.stage).toBe("DONE");
    expect(candidacy.closedAt).not.toBeNull();
    const followUp = await db.followUp.findUniqueOrThrow({ where: { id: result.followUpId } });
    expect(followUp).toMatchObject({ kind: "THREE_MONTHS", personId });
    expect(followUp.scheduledAt?.toISOString().slice(0, 10)).toBe("2027-02-05");
    expect(await db.auditLog.count({ where: { entity: "FollowUp", entityId: followUp.id } })).toBe(
      1,
    );
    expect(await db.candidacyEvent.count({ where: { candidacyId, toStage: "DONE" } })).toBe(1);
  });

  it("refuses a taken NIVOL (naming the page when visible), an invalid one, and a CRF e-mail elsewhere", async () => {
    const { candidacyId } = await created();
    await toGaia(candidacyId);
    const holder = await db.person.findFirstOrThrow({
      where: { status: "ACTIVE", nivol: { not: null } },
    });
    await expect(
      finalizeCandidacy(
        db,
        who("topaze"),
        finalizeSchema.parse({ candidacyId, nivol: holder.nivol, entryDate: "2026-11-05" }),
      ),
    ).rejects.toMatchObject({
      code: "NIVOL_TAKEN",
      message: expect.stringContaining(holder.ref) as string,
    });
    expect(
      finalizeSchema.safeParse({ candidacyId, nivol: "12345", entryDate: "2026-11-05" }).success,
    ).toBe(false);
    expect(
      finalizeSchema.safeParse({
        candidacyId,
        nivol: "00099770002B",
        crfEmail: "x@gmail.com",
        entryDate: "2026-11-05",
      }).error?.issues[0]?.message,
    ).toBe("L'e-mail Croix-Rouge doit se terminer par @croix-rouge.fr.");
  });

  it("writes nothing when the transaction fails midway", async () => {
    const { candidacyId, personId } = await created();
    await toGaia(candidacyId);
    const before = {
      person: await db.person.findUniqueOrThrow({ where: { id: personId } }),
      followUps: await db.followUp.count({ where: { personId } }),
      audit: await db.auditLog.count(),
    };
    await expect(
      finalizeCandidacy(
        db,
        who("diamant"),
        finalizeSchema.parse({ candidacyId, nivol: "00099770003C", entryDate: "2026-11-05" }),
        { beforeCommit: () => Promise.reject(new Error("panne provoquée (test)")) },
      ),
    ).rejects.toThrow("panne provoquée");
    expect(await db.person.findUniqueOrThrow({ where: { id: personId } })).toEqual(before.person);
    expect((await db.candidacy.findUniqueOrThrow({ where: { id: candidacyId } })).stage).toBe(
      "GAIA",
    );
    expect(await db.followUp.count({ where: { personId } })).toBe(before.followUps);
    expect(await db.auditLog.count()).toBe(before.audit);
  });

  it("re-engages a person who left, up to the finalisation (departure fields cleared)", async () => {
    const left = await db.person.findFirstOrThrow({
      where: { status: "LEFT", candidacies: { none: { closedAt: null } } },
    });
    expect(left.leftAt).not.toBeNull();
    const { candidacyId } = await reengagePerson(
      db,
      who("topaze"),
      { personId: left.id, source: "Bouche-à-oreille", interest: null, note: null },
      day,
    );
    expect((await db.person.findUniqueOrThrow({ where: { id: left.id } })).status).toBe("LEFT");
    await toGaia(candidacyId);
    await finalizeCandidacy(
      db,
      who("topaze"),
      finalizeSchema.parse({
        candidacyId,
        nivol: left.nivol ?? "00099770004D",
        entryDate: "2026-11-05",
      }),
    );
    const back = await db.person.findUniqueOrThrow({ where: { id: left.id } });
    expect(back).toMatchObject({
      status: "ACTIVE",
      leftAt: null,
      leftReason: null,
      purgeEligibleAt: null,
    });
  });
});

describe("mentorship", () => {
  it("proposes active adult mentors, fewest mentees first, and enforces the rules", async () => {
    const { personId } = await created();
    const suggestions = await mentorSuggestions(db, personId, day);
    expect(suggestions.length).toBeGreaterThan(0);
    const counts = suggestions.map((s) => s.activeMentees);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    const [first] = suggestions;
    if (!first) throw new Error("no mentor");
    const assign = (mentorId: string) =>
      assignMentor(
        db,
        who("diamant"),
        assignMentorSchema.parse({ menteeId: personId, mentorId, startDate: "2026-11-05" }),
        day,
      );
    const id = await assign(first.id);
    await expect(assign(first.id)).rejects.toThrow(/déjà en cours/);
    await expect(assign(personId)).rejects.toThrow(/autre personne/);
    const inactive = await db.person.findFirstOrThrow({ where: { status: "INACTIVE" } });
    await expect(assign(inactive.id)).rejects.toThrow(/actif/);
    const minor = await db.personSensitive.findFirstOrThrow({
      where: {
        birthDate: { gt: new Date("2008-11-06T00:00:00.000Z") },
        person: { status: "ACTIVE" },
      },
    });
    await expect(assign(minor.personId)).rejects.toThrow(/majeur/);
    expect(suggestions.map((s) => s.id)).not.toContain(minor.personId);
    await endMentorship(db, who("diamant"), {
      mentorshipId: id,
      endDate: day,
      note: "Fin (fictif).",
    });
    const ended = await db.mentorship.findUniqueOrThrow({ where: { id } });
    expect(ended.endDate?.toISOString().slice(0, 10)).toBe("2026-11-05");
    await expect(
      endMentorship(db, who("diamant"), { mentorshipId: id, endDate: day, note: null }),
    ).rejects.toThrow(/déjà terminé/);
  });
});

describe("visibility of /candidats", () => {
  it.each(USERS.map((u) => [u.key]))("%s only gets candidacies it may manage", async (key) => {
    const actor = who(key);
    const board = await candidacyBoard(
      db,
      actor,
      { owner: "all", overdueOnly: false, source: null, showAbandoned: true },
      day,
    );
    const facts = await loadPersonFactsMany(
      db,
      board.cards.map((c) => c.personId),
      day,
    );
    for (const card of board.cards) {
      const person = facts.get(card.personId);
      expect(person && can(actor, "candidacy.manage", { person }).allowed).toBe(true);
    }
    if (!["topaze", "diamant", "format-diamant"].includes(key)) {
      expect(board.cards).toEqual([]);
      expect(board.stats.overdue).toBe(0);
      expect(await overdueCandidacies(db, actor, day)).toBe(0);
    } else {
      expect(board.cards.length).toBeGreaterThan(0);
    }
  });

  it("the integration tab is refused without candidacy.manage", async () => {
    const card = (
      await candidacyBoard(
        db,
        who("topaze"),
        { owner: "all", overdueOnly: false, source: null, showAbandoned: false },
        day,
      )
    ).cards[0];
    if (!card) throw new Error("no card");
    const [facts] = [...(await loadPersonFactsMany(db, [card.personId], day)).values()];
    if (!facts) throw new Error("facts");
    await expect(integrationTab(db, who("action"), card.personId, facts, day)).rejects.toThrow();
    const tab = await integrationTab(db, who("diamant"), card.personId, facts, day);
    expect(tab.current?.transitions.length).toBeGreaterThan(0);
  });
});
