import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { finalizeSchema, newCandidateSchema, stageChangeSchema } from "@/lib/candidacyForms";
import type { DossierDraft } from "@/lib/dossierSchema";
import { loadActor } from "@/server/auth/loadActor";
import {
  attestationState,
  completeAttestation,
  countersign,
  sendSignatureCode,
  signAsParty,
} from "@/server/dossier/signing";
import { loadDraft, saveDraft, submitDraft } from "@/server/dossier/store";
import type { MailMessage, MailService } from "@/server/mail/types";
import { sha256 } from "@/server/pdf/templates";
import { ForbiddenError } from "@/server/policy/can";
import { loadPersonFacts } from "@/server/policy/facts";
import type { Actor, PersonFacts } from "@/server/policy/types";
import { changeStage, createCandidate, finalizeCandidacy } from "@/server/services/candidacies";
import { createDossierLink } from "@/server/services/dossiers";
import {
  gaiaBlock,
  readGaiaSheet,
  setGaiaChecklistItem,
  undoFinalize,
} from "@/server/services/gaia";
import { memoryStorage } from "@/server/storage/memory";
import { getTestDb } from "@/test/db/testDatabase";
import { pdfText } from "@/test/pdfText";
import { fakeSignature } from "@/test/png";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};
let n = 0;
const png = new Uint8Array(fakeSignature());

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

function inbox(): MailService & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    driver: "log",
    sent,
    send(message) {
      sent.push(message);
      return Promise.resolve();
    },
  };
}

/** A fictitious NIVOL, unique per call. */
function nivol(): string {
  n += 1;
  return `${String(90000000000 + n * 7919).padStart(11, "0")}G`;
}

interface Gaia {
  personId: string;
  candidacyId: string;
  facts: PersonFacts;
}

/** A candidate at « Création Gaia » (no dossier). */
async function atGaia(): Promise<Gaia> {
  n += 1;
  const out = await createCandidate(
    db,
    who("diamant"),
    newCandidateSchema.parse({
      firstName: "Gaia",
      lastName: `Fictive${String(n)}`,
      email: `gaia${String(n)}@exemple.test`,
    }),
    day,
  );
  if (out.status !== "created") throw new Error("duplicate");
  for (const [from, to] of [
    ["FIRST_CONTACT", "CONFIRMED"],
    ["CONFIRMED", "FILE"],
    ["FILE", "GAIA"],
  ] as const) {
    await changeStage(
      db,
      who("diamant"),
      stageChangeSchema.parse({ candidacyId: out.candidacyId, expectedStage: from, toStage: to }),
      day,
    );
  }
  const facts = await loadPersonFacts(db, out.personId, day);
  if (!facts) throw new Error("facts");
  return { personId: out.personId, candidacyId: out.candidacyId, facts };
}

function dossier(last: string, email: string): DossierDraft {
  return {
    identity: {
      civility: "MME",
      lastName: last,
      firstName: "Łucja",
      birthDate: "1995-04-12",
      birthCity: "Versailles",
      birthDepartment: "78",
      birthCountry: "France",
    },
    contact: {
      street: "1 rue Fictive",
      postalCode: "78000",
      city: "Versailles",
      country: "France",
      phone: "06 39 98 12 34",
      email,
    },
    crf: { alreadyVolunteer: false, hasNivol: false, hasCrfEmail: false, activities: [] },
    emergency: {
      lastName: "Fictif",
      firstName: "Paul",
      relationship: "Père",
      phone1: "0639984321",
    },
    profile: {},
    consent: { rgpd: true },
  };
}

/** A candidate whose dossier is signed and countersigned: at GAIA, documents stored. */
async function signedAtGaia(storage: ReturnType<typeof memoryStorage>): Promise<Gaia> {
  n += 1;
  const last = `Signée${String(n)}`;
  const email = `signee${String(n)}@exemple.test`;
  const out = await createCandidate(
    db,
    who("diamant"),
    newCandidateSchema.parse({ firstName: "Łucja", lastName: last, email }),
    day,
  );
  if (out.status !== "created") throw new Error("duplicate");
  await changeStage(
    db,
    who("diamant"),
    stageChangeSchema.parse({
      candidacyId: out.candidacyId,
      expectedStage: "FIRST_CONTACT",
      toStage: "CONFIRMED",
    }),
    day,
  );
  await createDossierLink(db, who("diamant"), { personId: out.personId });
  const draft = await loadDraft(db, out.personId);
  if (!draft) throw new Error("draft");
  await saveDraft(db, draft.submissionId, dossier(last, email));
  const submitted = await submitDraft(db, {
    submissionId: draft.submissionId,
    day,
    structure: "Unité locale de Versailles",
  });
  if (!submitted.ok) throw new Error("submit");
  const mail = inbox();
  await sendSignatureCode(db, mail, { submissionId: draft.submissionId, role: "VOLUNTEER" });
  await signAsParty(db, storage, {
    submissionId: draft.submissionId,
    role: "VOLUNTEER",
    verification: { kind: "code", code: /(\d{6})/.exec(mail.sent[0]?.text ?? "")?.[1] ?? "" },
    signature: { kind: "drawn", png },
    userAgent: "Vitest (fictif)",
    ip: "203.0.113.7",
  });
  await countersign(db, storage, inbox(), who("diamant"), {
    submissionId: draft.submissionId,
    signature: { kind: "drawn", png },
    quality: "DIAMANT",
  });
  const facts = await loadPersonFacts(db, out.personId, day);
  if (!facts) throw new Error("facts");
  return { personId: out.personId, candidacyId: out.candidacyId, facts };
}

const finalize = (g: Gaia, value: string, crfEmail = "", actor = who("diamant")) =>
  finalizeCandidacy(
    db,
    actor,
    finalizeSchema.parse({
      candidacyId: g.candidacyId,
      nivol: value,
      crfEmail,
      entryDate: "2026-11-06",
    }),
  );

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "diamant", "action"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (!actor) throw new Error(key);
    actors[key] = actor;
  }
}, 180_000);

describe("Gaia block and sheet", () => {
  it("the checklist is dated (who, when); an unknown key is refused", async () => {
    const g = await atGaia();
    let block = await gaiaBlock(db, who("diamant"), g.personId, g.facts);
    expect(block?.checklist.map((i) => i.label)).toEqual([
      "Personne créée dans Gaia",
      "Rattachement à l'UL de Versailles",
      "Compte @croix-rouge.fr demandé",
    ]);
    await setGaiaChecklistItem(
      db,
      who("diamant"),
      { personId: g.personId, candidacyId: g.candidacyId, key: "created", checked: true },
      new Date("2026-11-06T09:30:00.000Z"),
    );
    block = await gaiaBlock(db, who("diamant"), g.personId, g.facts);
    expect(block?.checklist[0]?.checked).toEqual({
      at: "2026-11-06T09:30:00.000Z",
      byId: who("diamant").userId,
      by: who("diamant").name,
    });
    await setGaiaChecklistItem(db, who("diamant"), {
      personId: g.personId,
      candidacyId: g.candidacyId,
      key: "created",
      checked: false,
    });
    block = await gaiaBlock(db, who("diamant"), g.personId, g.facts);
    expect(block?.checklist[0]?.checked).toBeNull();
    await expect(
      setGaiaChecklistItem(db, who("diamant"), {
        personId: g.personId,
        candidacyId: g.candidacyId,
        key: "inconnu",
        checked: true,
      }),
    ).rejects.toThrow("Élément de la liste inconnu.");
    expect(
      await db.auditLog.count({
        where: { entity: "Candidacy", entityId: g.candidacyId, field: "gaiaChecklist" },
      }),
    ).toBe(2);
  });

  it("the sheet is read on demand, with an access log (context « gaia »)", async () => {
    const g = await atGaia();
    const before = await db.accessLog.count({ where: { personId: g.personId, context: "gaia" } });
    const rows = await readGaiaSheet(db, who("diamant"), g.personId, g.facts);
    expect(rows.find((r) => r.key === "firstName")?.value).toBe("Gaia");
    expect(await db.accessLog.count({ where: { personId: g.personId, context: "gaia" } })).toBe(
      before + 1,
    );
    await expect(readGaiaSheet(db, who("action"), g.personId, g.facts)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("closure", () => {
  it("closes in one transaction: ACTIVE, NIVOL, CRF e-mail, DONE with its event, 3-month follow-up", async () => {
    const g = await atGaia();
    const value = nivol();
    const result = await finalize(g, value, `gaia.fictive${String(n)}@croix-rouge.fr`);
    const person = await db.person.findUniqueOrThrow({ where: { id: g.personId } });
    expect(person).toMatchObject({ status: "ACTIVE", nivol: value });
    expect(person.crfEmail).toMatch(/@croix-rouge\.fr$/);
    expect(person.entryDate?.toISOString().slice(0, 10)).toBe("2026-11-06");
    const candidacy = await db.candidacy.findUniqueOrThrow({ where: { id: g.candidacyId } });
    expect(candidacy.stage).toBe("DONE");
    expect(
      await db.candidacyEvent.count({ where: { candidacyId: g.candidacyId, toStage: "DONE" } }),
    ).toBe(1);
    const followUp = await db.followUp.findUniqueOrThrow({ where: { id: result.followUpId } });
    expect(followUp).toMatchObject({ kind: "THREE_MONTHS" });
    expect(followUp.scheduledAt?.toISOString().slice(0, 10)).toBe("2027-02-06");
  });

  it("refuses a NIVOL or a CRF e-mail that another person already has", async () => {
    const a = await atGaia();
    const b = await atGaia();
    const value = nivol();
    const email = `doublon${String(n)}@croix-rouge.fr`;
    await finalize(a, value, email);
    await expect(finalize(b, value)).rejects.toThrow(/Ce NIVOL est déjà attribué à Gaia Fictive/);
    await expect(finalize(b, nivol(), email.toUpperCase())).rejects.toThrow(
      /Cet e-mail Croix-Rouge est déjà celui de Gaia Fictive/,
    );
    expect((await db.person.findUniqueOrThrow({ where: { id: b.personId } })).status).toBe(
      "CANDIDATE",
    );
  });

  it("two simultaneous closures: the second is refused", async () => {
    const g = await atGaia();
    const results = await Promise.allSettled([finalize(g, nivol()), finalize(g, nivol())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.candidacyEvent.count({ where: { candidacyId: g.candidacyId, toStage: "DONE" } }),
    ).toBe(1);
  });
});

describe("undo of a closure", () => {
  it("TOPAZE undoes within 7 days with a reason; everything is traced", async () => {
    const g = await atGaia();
    await finalize(g, nivol(), `annule${String(n)}@croix-rouge.fr`);
    const facts = await loadPersonFacts(db, g.personId, day);
    if (!facts) throw new Error("facts");
    await expect(
      undoFinalize(db, who("diamant"), facts, { candidacyId: g.candidacyId, reason: "Erreur" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      undoFinalize(db, who("topaze"), facts, { candidacyId: g.candidacyId, reason: " " }),
    ).rejects.toThrow("Le motif est obligatoire.");
    const block = await gaiaBlock(db, who("topaze"), g.personId, facts);
    expect(block?.canUndo).toBe(true);
    await undoFinalize(db, who("topaze"), facts, {
      candidacyId: g.candidacyId,
      reason: "Mauvaise fiche (fictif)",
    });
    const person = await db.person.findUniqueOrThrow({ where: { id: g.personId } });
    expect(person).toMatchObject({
      status: "CANDIDATE",
      nivol: null,
      crfEmail: null,
      entryDate: null,
    });
    const candidacy = await db.candidacy.findUniqueOrThrow({ where: { id: g.candidacyId } });
    expect(candidacy).toMatchObject({ stage: "GAIA", closedAt: null });
    const event = await db.candidacyEvent.findFirstOrThrow({
      where: { candidacyId: g.candidacyId, fromStage: "DONE", toStage: "GAIA" },
    });
    expect(event.note).toBe("Clôture annulée : Mauvaise fiche (fictif)");
    const followUp = await db.followUp.findFirstOrThrow({
      where: { personId: g.personId, kind: "THREE_MONTHS" },
    });
    expect(followUp.cancelledAt).not.toBeNull();
    expect(followUp.cancelReason).toContain("Mauvaise fiche");
    // A new closure is possible again.
    await finalize(g, nivol());
  });

  it("is refused after 7 days", async () => {
    const g = await atGaia();
    await finalize(g, nivol());
    const facts = await loadPersonFacts(db, g.personId, day);
    if (!facts) throw new Error("facts");
    const later = new Date(Date.now() + 8 * 86_400_000);
    await expect(
      undoFinalize(
        db,
        who("topaze"),
        facts,
        { candidacyId: g.candidacyId, reason: "Trop tard" },
        later,
      ),
    ).rejects.toThrow(/plus de 7 jours/);
  });
});

describe("aptitude certificate completed with the NIVOL", () => {
  it("regenerates a new version with the NIVOL, archives the previous one, adds its hash to the proof", async () => {
    const storage = memoryStorage();
    const g = await signedAtGaia(storage);
    const value = nivol();
    await finalize(g, value);
    expect(await attestationState(db, g.personId)).toBe("pending");
    const before = await db.document.findFirstOrThrow({
      where: { personId: g.personId, kind: "APTITUDE", archivedAt: null },
    });
    const { documentId } = await completeAttestation(db, storage, who("diamant"), g.personId);
    const after = await db.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(after.version).toBe(before.version + 1);
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: before.id } })).archivedAt,
    ).not.toBeNull();
    const bytes = storage.files.get(after.storageKey);
    if (!bytes) throw new Error("file");
    expect(sha256(bytes)).toBe(after.sha256);
    expect((await PDFDocument.load(bytes)).getForm().getFields()).toHaveLength(0);
    expect(await pdfText(bytes)).toContain(value);
    const signature = await db.signature.findFirstOrThrow({
      where: { submission: { personId: g.personId }, signerRole: "VOLUNTEER" },
    });
    expect(Object.values(signature.documentHashes as Record<string, string>)).toContain(
      after.sha256,
    );
    expect(await attestationState(db, g.personId)).toBe("done");

    // Undo: the NIVOL version is archived, the previous one is active again.
    const facts = await loadPersonFacts(db, g.personId, day);
    if (!facts) throw new Error("facts");
    const candidacyId = g.candidacyId;
    await undoFinalize(db, who("topaze"), facts, { candidacyId, reason: "Erreur de NIVOL" });
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: documentId } })).archivedAt,
    ).not.toBeNull();
    expect(
      (await db.document.findUniqueOrThrow({ where: { id: before.id } })).archivedAt,
    ).toBeNull();
  });

  it("storage down: clear message, nothing changes", async () => {
    const storage = memoryStorage();
    const g = await signedAtGaia(storage);
    await finalize(g, nivol());
    await expect(
      completeAttestation(
        db,
        { ...storage, put: () => Promise.reject(new Error("panne (test)")) },
        who("diamant"),
        g.personId,
      ),
    ).rejects.toThrow(/Compléter l'attestation/);
    expect(await attestationState(db, g.personId)).toBe("pending");
  });
});
