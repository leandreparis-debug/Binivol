import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import type { DossierDraft } from "@/lib/dossierSchema";
import { loadActor } from "@/server/auth/loadActor";
import {
  addAttachment,
  applyDossier,
  loadDraft,
  readDossierForReview,
  saveDraft,
  submitDraft,
} from "@/server/dossier/store";
import { hashDossierToken } from "@/server/dossier/token";
import { logMail, openMail } from "@/server/mail";
import { loadPersonFacts } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import { createCandidate } from "@/server/services/candidacies";
import {
  createDossierLink,
  linkState,
  openDossierLink,
  openOnSite,
  resolveDossierLink,
  revokeDossierLink,
  sendDossierLink,
} from "@/server/services/dossiers";
import {
  formActor,
  onSiteContext,
  saveDossierForm,
  submitDossierForm,
} from "@/server/services/dossierForm";
import { listOutboundMails } from "@/server/services/outboundMails";
import { memoryStorage } from "@/server/storage/memory";
import { getTestDb } from "@/test/db/testDatabase";
import { newCandidateSchema } from "@/lib/candidacyForms";
import { changeStage } from "@/server/services/candidacies";
import { stageChangeSchema } from "@/lib/candidacyForms";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};
let n = 0;
const PDF = Buffer.from("%PDF-1.7\n% fictif\n%%EOF\n");

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

/** A complete, valid, fictitious dossier. */
function completeDossier(birthDate = "1995-04-12"): DossierDraft {
  return {
    identity: {
      civility: "MME",
      lastName: "Fictive",
      firstName: "Lilou",
      birthDate,
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
      email: "lilou.fictive@exemple.test",
    },
    crf: {
      alreadyVolunteer: false,
      hasNivol: true,
      nivol: "000 9988 1111 a",
      hasCrfEmail: false,
      activities: ["Postes de secours"],
    },
    emergency: {
      civility: "M",
      lastName: "Fictif",
      firstName: "Paul",
      relationship: "Père",
      phone1: "06 39 98 43 21",
    },
    profile: {
      skills: [{ label: "Logistique", level: "EXPERT" }],
      profession: "Infirmière (fictif)",
      languages: [{ label: "Anglais", level: "FLUENT" }],
      diplomas: ["BAFA"],
      licenses: ["b"],
    },
    consent: { rgpd: true },
  };
}

/** A new candidate moved to CONFIRMED. */
async function confirmedCandidate(): Promise<{
  personId: string;
  candidacyId: string;
  ref: string;
}> {
  n += 1;
  const out = await createCandidate(
    db,
    who("diamant"),
    newCandidateSchema.parse({
      firstName: `Dossier${String(n)}`,
      lastName: `Fictif${String(n)}`,
      email: `dossier${String(n)}@exemple.test`,
    }),
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
  return { personId: out.personId, candidacyId: out.candidacyId, ref: out.ref };
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

describe("dossier links", () => {
  it("creating a link stores only the hash, moves CONFIRMED to FILE and prefills the draft", async () => {
    const c = await confirmedCandidate();
    const link = await createDossierLink(db, who("diamant"), { personId: c.personId });
    expect(link.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const row = await db.dossierLink.findUniqueOrThrow({ where: { id: link.linkId } });
    expect(row.tokenHash).toBe(hashDossierToken(link.token));
    expect(row.tokenHash).not.toContain(link.token);
    expect(Math.round((row.expiresAt.getTime() - row.createdAt.getTime()) / 86_400_000)).toBe(7);
    expect((await db.candidacy.findUniqueOrThrow({ where: { id: c.candidacyId } })).stage).toBe(
      "FILE",
    );
    const draft = await loadDraft(db, c.personId);
    expect(draft?.data.identity?.firstName).toBe(`Dossier${String(n)}`);
    expect(draft?.data.contact?.email).toBe(`dossier${String(n)}@exemple.test`);
  });

  it("a new link revokes the previous one and takes over the draft already typed", async () => {
    const c = await confirmedCandidate();
    const first = await createDossierLink(db, who("diamant"), { personId: c.personId });
    const draft = await loadDraft(db, c.personId);
    if (!draft) throw new Error("draft");
    await saveDraft(db, draft.submissionId, {
      ...draft.data,
      profile: { profession: "Saisi avant (fictif)" },
    });
    const second = await createDossierLink(db, who("diamant"), { personId: c.personId });
    expect(linkState(await db.dossierLink.findUniqueOrThrow({ where: { id: first.linkId } }))).toBe(
      "revoked",
    );
    expect(await openDossierLink(db, first.token)).toEqual({ ok: false });
    expect(await openDossierLink(db, second.token)).toEqual({ ok: true, linkId: second.linkId });
    const ctx = await resolveDossierLink(db, second.linkId);
    expect(ctx?.draft.submissionId).toBe(draft.submissionId);
    expect(ctx?.draft.data.profile?.profession).toBe("Saisi avant (fictif)");
  });

  it("refuses unknown, expired and revoked tokens alike, and audits the attempt without the token", async () => {
    const c = await confirmedCandidate();
    const link = await createDossierLink(db, who("diamant"), { personId: c.personId });
    await revokeDossierLink(db, who("diamant"), link.linkId);
    const before = await db.auditLog.count({
      where: { action: "LOGIN_DENIED", entity: "DossierLink" },
    });
    expect(await openDossierLink(db, link.token)).toEqual({ ok: false });
    expect(await openDossierLink(db, "x".repeat(43))).toEqual({ ok: false });
    expect(await openDossierLink(db, "pas-un-jeton")).toEqual({ ok: false });
    const fresh = await createDossierLink(
      db,
      who("diamant"),
      { personId: c.personId },
      new Date(Date.now() - 8 * 86_400_000),
    );
    expect(await openDossierLink(db, fresh.token)).toEqual({ ok: false });
    const entries = await db.auditLog.findMany({
      where: { action: "LOGIN_DENIED", entity: "DossierLink" },
      orderBy: { at: "desc" },
      take: 4,
    });
    expect(
      await db.auditLog.count({ where: { action: "LOGIN_DENIED", entity: "DossierLink" } }),
    ).toBe(before + 4);
    expect(JSON.stringify(entries)).not.toContain(link.token);
    expect(JSON.stringify(entries)).not.toContain(fresh.token);
  });

  it("e-mails only the first name and the link, sealed in outbound_mails", async () => {
    const c = await confirmedCandidate();
    const link = await createDossierLink(db, who("diamant"), { personId: c.personId });
    const { to } = await sendDossierLink(
      db,
      who("diamant"),
      { linkId: link.linkId, token: link.token, baseUrl: "https://binivol.exemple.test" },
      logMail(db, who("diamant").userId),
    );
    expect(to).toBe(`dossier${String(n)}@exemple.test`);
    const mail = await db.outboundMail.findFirstOrThrow({
      where: { to },
      orderBy: { createdAt: "desc" },
    });
    expect(mail.payload).not.toContain(link.token);
    const content = openMail(mail.payload);
    expect(content?.text).toContain(`https://binivol.exemple.test/dossier/ouvrir#${link.token}`);
    expect(content?.text).toContain(`Bonjour Dossier${String(n)},`);
    expect(content?.text).not.toContain(`Fictif${String(n)}`);
  });

  it("never stores the token in clear, in any table", async () => {
    const c = await confirmedCandidate();
    const link = await createDossierLink(db, who("diamant"), { personId: c.personId });
    await sendDossierLink(
      db,
      who("diamant"),
      { linkId: link.linkId, token: link.token, baseUrl: "https://binivol.exemple.test" },
      logMail(db, who("diamant").userId),
    );
    const tables = await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
    for (const { tablename } of tables) {
      const rows = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "public"."${tablename}" t WHERE t::text LIKE $1`,
        `%${link.token}%`,
      );
      expect({ tablename, n: Number(rows[0]?.n ?? 0) }).toEqual({ tablename, n: 0 });
    }
    expect(await db.dossierLink.count({ where: { tokenHash: "" } })).toBe(0);
  });
});

describe("draft, submission and review", () => {
  it("saves and resumes a draft, refuses an incomplete submission, then submits once", async () => {
    const c = await confirmedCandidate();
    const link = await createDossierLink(db, who("diamant"), { personId: c.personId });
    const draft = await loadDraft(db, c.personId);
    if (!draft) throw new Error("draft");
    await saveDraft(db, draft.submissionId, { identity: { firstName: "Lilou" } });
    const refused = await submitDraft(db, {
      submissionId: draft.submissionId,
      day,
      structure: "Unité locale de Versailles",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.issues.map((i) => i.step)).toContain("identite");
    await saveDraft(db, draft.submissionId, completeDossier());
    const ok = await submitDraft(db, {
      submissionId: draft.submissionId,
      day,
      structure: "Unité locale de Versailles",
    });
    expect(ok.ok).toBe(true);
    const row = await db.dossierSubmission.findUniqueOrThrow({ where: { id: draft.submissionId } });
    expect(row).toMatchObject({ status: "SUBMITTED", schemaVersion: 1 });
    expect(row.data).toMatchObject({
      crf: { nivol: "00099881111A" },
      contact: { phone: "0639981234" },
      structure: "Unité locale de Versailles",
    });
    expect(linkState(await db.dossierLink.findUniqueOrThrow({ where: { id: link.linkId } }))).toBe(
      "used",
    );
    expect(await openDossierLink(db, link.token)).toEqual({ ok: false });
    await expect(saveDraft(db, draft.submissionId, {})).rejects.toThrow(/déjà été envoyé/);
    const audit = await db.auditLog.findMany({
      where: { entity: "DossierSubmission", entityId: draft.submissionId },
    });
    expect(JSON.stringify(audit)).not.toContain("Lilou");
  });

  it("requires a parental authorisation before 16, and a legal guardian before 18", async () => {
    const c = await confirmedCandidate();
    await createDossierLink(db, who("diamant"), { personId: c.personId });
    const draft = await loadDraft(db, c.personId);
    if (!draft) throw new Error("draft");
    await saveDraft(db, draft.submissionId, completeDossier("2011-02-01")); // 15 years old
    const refused = await submitDraft(db, {
      submissionId: draft.submissionId,
      day,
      structure: "UL",
    });
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.issues.map((i) => `${i.step}:${i.field}`).sort()).toEqual(
        [
          "pieces:PARENTAL_AUTH",
          "representant:firstName",
          "representant:lastName",
          "representant:phone",
          "representant:quality",
        ].sort(),
      );
    }
    await saveDraft(db, draft.submissionId, {
      ...completeDossier("2011-02-01"),
      guardian: {
        lastName: "Fictif",
        firstName: "Anne",
        quality: "Mère",
        phone: "06 39 98 00 01",
        email: "anne.fictif@exemple.test",
      },
    });
    const storage = memoryStorage();
    await addAttachment(db, storage, {
      submissionId: draft.submissionId,
      kind: "PARENTAL_AUTH",
      fileName: "autorisation.pdf",
      bytes: PDF,
    });
    const ok = await submitDraft(db, { submissionId: draft.submissionId, day, structure: "UL" });
    expect(ok.ok).toBe(true);
    const docs = await db.document.findMany({ where: { personId: c.personId } });
    expect(docs.map((d) => d.kind)).toEqual(["PARENTAL_AUTH"]);
    expect(storage.files.size).toBe(1);
  });

  it("keeps the draft and says so when the storage is down", async () => {
    const c = await confirmedCandidate();
    await createDossierLink(db, who("diamant"), { personId: c.personId });
    const draft = await loadDraft(db, c.personId);
    if (!draft) throw new Error("draft");
    await expect(
      addAttachment(db, memoryStorage({ failPut: true }), {
        submissionId: draft.submissionId,
        kind: "DIPLOMA_COPY",
        fileName: "d.pdf",
        bytes: PDF,
      }),
    ).rejects.toMatchObject({
      code: "STORAGE_UNAVAILABLE",
      message: expect.stringMatching(/dossier est enregistré/) as string,
    });
    expect(await db.dossierAttachment.count({ where: { submissionId: draft.submissionId } })).toBe(
      0,
    );
  });

  it("reviews with an access log and reports only the checked fields, never the NIVOL", async () => {
    const c = await confirmedCandidate();
    await createDossierLink(db, who("diamant"), { personId: c.personId });
    const draft = await loadDraft(db, c.personId);
    if (!draft) throw new Error("draft");
    await saveDraft(db, draft.submissionId, completeDossier());
    await submitDraft(db, { submissionId: draft.submissionId, day, structure: "UL" });
    const facts = await loadPersonFacts(db, c.personId);
    if (!facts) throw new Error("facts");
    const logs = await db.accessLog.count({ where: { personId: c.personId, context: "dossier" } });
    const review = await readDossierForReview(db, who("diamant"), c.personId, facts);
    expect(await db.accessLog.count({ where: { personId: c.personId, context: "dossier" } })).toBe(
      logs + 1,
    );
    const row = (key: string) => review?.rows.find((r) => r.key === key);
    expect(row("birthDate")).toMatchObject({
      current: null,
      proposed: "12/04/1995",
      defaultChecked: true,
    });
    expect(row("firstName")).toMatchObject({ defaultChecked: false, differs: true });
    expect(row("nivol")).toMatchObject({ reportable: false, proposed: "00099881111A" });
    await expect(readDossierForReview(db, who("action"), c.personId, facts)).rejects.toThrow();

    await applyDossier(db, who("diamant"), {
      personId: c.personId,
      submissionId: draft.submissionId,
      keys: [
        "birthDate",
        "street",
        "postalCode",
        "city",
        "emergency.lastName",
        "emergency.phone1",
        "skills",
        "licenses",
      ],
    });
    const person = await db.person.findUniqueOrThrow({ where: { id: c.personId } });
    expect(person).toMatchObject({ firstName: `Dossier${String(n)}`, nivol: null, crfEmail: null });
    const sensitive = await db.personSensitive.findUniqueOrThrow({
      where: { personId: c.personId },
    });
    expect(sensitive.birthDate?.toISOString().slice(0, 10)).toBe("1995-04-12");
    expect(sensitive).toMatchObject({
      street: "1 rue Fictive",
      postalCode: "78000",
      city: "Versailles",
      birthCity: null,
    });
    expect(
      await db.emergencyContact.findFirstOrThrow({ where: { personId: c.personId } }),
    ).toMatchObject({
      lastName: "Fictif",
      phone1: "0639984321",
      firstName: null,
    });
    expect(
      (await db.personSkill.findMany({ where: { personId: c.personId } })).map((s) => s.label),
    ).toEqual(["Logistique"]);
    expect(
      (await db.personLicense.findMany({ where: { personId: c.personId } })).map((l) => l.category),
    ).toEqual(["B"]);
    expect(await db.personLanguage.count({ where: { personId: c.personId } })).toBe(0);
    const audit = await db.auditLog.findMany({
      where: { entity: { in: ["PersonSensitive", "EmergencyContact"] } },
    });
    expect(JSON.stringify(audit)).not.toContain("1 rue Fictive");
  });

  it("on-site mode uses an ON_SITE link that can never be opened remotely", async () => {
    const c = await confirmedCandidate();
    const linkId = await openOnSite(db, who("diamant"), c.personId);
    const link = await db.dossierLink.findUniqueOrThrow({ where: { id: linkId } });
    expect(link.mode).toBe("ON_SITE");
    expect((await resolveDossierLink(db, linkId))?.mode).toBe("ON_SITE");
    expect(await openOnSite(db, who("diamant"), c.personId)).toBe(linkId);
  });

  it("on-site saves and submits under the responsible's name, then the mode closes", async () => {
    const c = await confirmedCandidate();
    await openOnSite(db, who("diamant"), c.personId);
    const context = await onSiteContext(db, c.personId);
    if (!context) throw new Error("on-site");
    const audit = formActor(context, who("diamant"));
    expect(audit.label).toMatch(/\(sur place\)$/);
    await saveDossierForm(db, context, completeDossier(), audit);
    expect(await submitDossierForm(db, context, completeDossier(), audit)).toEqual({
      submitted: true,
    });
    expect(await onSiteContext(db, c.personId)).toBeNull();
    const logs = await db.auditLog.findMany({
      where: { entity: "DossierSubmission", actorLabel: audit.label },
    });
    expect(logs.length).toBeGreaterThan(0);
  });
});

describe("mail log (/admin/courriels)", () => {
  it("is TOPAZE only, and decrypts the kept e-mails", async () => {
    await logMail(db, null).send({ to: "lu@exemple.test", subject: "Sujet", text: "Corps fictif" });
    const mails = await listOutboundMails(db, who("topaze"));
    expect(mails[0]).toMatchObject({ to: "lu@exemple.test", text: "Corps fictif" });
    await expect(listOutboundMails(db, who("diamant"))).rejects.toThrow();
  });
});
