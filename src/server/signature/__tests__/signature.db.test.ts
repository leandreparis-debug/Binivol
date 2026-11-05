// @vitest-environment node
import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { newCandidateSchema, stageChangeSchema } from "@/lib/candidacyForms";
import type { DossierDraft } from "@/lib/dossierSchema";
import { loadActor } from "@/server/auth/loadActor";
import { saveDraft, submitDraft } from "@/server/dossier/store";
import { logMail, type MailMessage, type MailService } from "@/server/mail";
import { sha256 } from "@/server/pdf/templates";
import { loadPersonFacts } from "@/server/policy/facts";
import type { Actor, PersonFacts } from "@/server/policy/types";
import { changeStage, createCandidate } from "@/server/services/candidacies";
import { createDossierLink, linkState, openDossierLink } from "@/server/services/dossiers";
import { memoryStorage } from "@/server/storage/memory";
import { getTestDb } from "@/test/db/testDatabase";
import { pdfText, signaturePng } from "@/test/pdf/helpers";
import {
  candidateSigningView,
  countersign,
  requestSignatureCode,
  resendSignedDocuments,
  signatureBlock,
  signInPerson,
  signWithCode,
} from "../service";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};
const meta = { userAgent: "Vitest (fictif)", ip: "203.0.113.9" };
const png = signaturePng();
let n = 0;

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

/** Captures the e-mails (the code is read from them). */
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

const brokenMail: MailService = {
  driver: "smtp",
  send: () => Promise.reject(new Error("relais en panne (test)")),
};

function codeOf(message: MailMessage | undefined): string {
  const code = /\n(\d{6})\n/.exec(message?.text ?? "")?.[1];
  if (!code) throw new Error("no code");
  return code;
}

function dossier(birthDate: string, n: number): DossierDraft {
  return {
    identity: {
      civility: "MME",
      lastName: `Ñúñez-O'Brien${String(n)}`,
      firstName: "Łucja",
      birthDate,
      birthCity: "Kraków",
      birthCountry: "Pologne",
    },
    contact: {
      street: "1 rue Fictive",
      postalCode: "78000",
      city: "Versailles",
      country: "France",
      phone: "06 39 98 12 34",
      email: `lucja${String(n)}@exemple.test`,
    },
    crf: { alreadyVolunteer: false, hasNivol: false, hasCrfEmail: false, activities: [] },
    emergency: {
      civility: "M",
      lastName: "Fictif",
      firstName: "Paul",
      relationship: "Père",
      phone1: "06 39 98 43 21",
    },
    profile: {},
    guardian: {
      lastName: "Ñúñez",
      firstName: "Dominika",
      quality: "Mère",
      phone: "06 39 98 00 03",
      email: `dominika${String(n)}@exemple.test`,
    },
    consent: { rgpd: true },
  };
}

interface Candidate {
  personId: string;
  candidacyId: string;
  linkId: string;
  token: string;
  facts: PersonFacts;
}

/** A candidate with a link and a submitted dossier (adult or minor). */
async function submittedCandidate(minor = false): Promise<Candidate> {
  n += 1;
  const out = await createCandidate(
    db,
    who("diamant"),
    newCandidateSchema.parse({
      firstName: "Łucja",
      lastName: `Signature${String(n)}`,
      email: `signature${String(n)}@exemple.test`,
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
  const link = await createDossierLink(db, who("diamant"), { personId: out.personId });
  const draft = await db.dossierSubmission.findFirstOrThrow({
    where: { personId: out.personId, status: "DRAFT" },
  });
  const birth = minor ? "2010-01-15" : "1995-04-12";
  await saveDraft(db, draft.id, dossier(birth, n));
  const submitted = await submitDraft(db, {
    submissionId: draft.id,
    day,
    structure: "Unité locale de Versailles",
  });
  if (!submitted.ok) throw new Error(JSON.stringify(submitted.issues));
  const facts = await loadPersonFacts(db, out.personId, day);
  if (!facts) throw new Error("facts");
  return {
    personId: out.personId,
    candidacyId: out.candidacyId,
    linkId: link.linkId,
    token: link.token,
    facts,
  };
}

async function signByCode(c: Candidate, role: "VOLUNTEER" | "PARENT", now: Date) {
  const mail = inbox();
  await requestSignatureCode(db, { personId: c.personId, role }, mail, now);
  return signWithCode(
    db,
    storage,
    {
      personId: c.personId,
      linkId: c.linkId,
      role,
      png,
      inputKind: "DRAWN",
      code: codeOf(mail.sent[0]),
    },
    meta,
    new Date(now.getTime() + 30_000),
  );
}

const storage = memoryStorage();
let clock = Date.parse("2026-11-06T09:00:00.000Z");
/** A new instant for each call: the code rhythm (60 s) never blocks unrelated steps. */
const tick = () => new Date((clock += 10 * 60_000));

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "diamant", "action"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (!actor) throw new Error(key);
    actors[key] = actor;
  }
}, 180_000);

describe("candidate signature", () => {
  it("the link stays open after submission, only for the signature, and is consumed when signed", async () => {
    const c = await submittedCandidate();
    expect(await openDossierLink(db, c.token)).toEqual({ ok: true, linkId: c.linkId });
    const view = await candidateSigningView(db, c.personId);
    expect(view).toMatchObject({ next: "VOLUNTEER", minor: false });
    expect(view?.signerName).toContain("Łucja");
    expect(view?.codeTo).toMatch(/^l•+@exemple\.test$/);
    expect(view?.documents.map((d) => d.fileName)).toEqual([
      expect.stringMatching(/^ÑÚÑEZ-O'BRIEN\d+_Łucja_Dossier-Bénévole\.pdf$/),
      expect.stringMatching(/_Charte-du-Bénévolat\.pdf$/),
      expect.stringMatching(/_Attestation-d_Aptitude\.pdf$/),
    ]);
    const after = await signByCode(c, "VOLUNTEER", tick());
    expect(after.next).toBe("DONE");
    const link = await db.dossierLink.findUniqueOrThrow({ where: { id: c.linkId } });
    expect(linkState(link)).toBe("used");
    expect(await openDossierLink(db, c.token)).toEqual({ ok: false });
    const signature = await db.signature.findFirstOrThrow({
      where: { submission: { personId: c.personId }, signerRole: "VOLUNTEER" },
    });
    expect(signature).toMatchObject({
      method: "OTP_EMAIL",
      inputKind: "DRAWN",
      userAgent: "Vitest (fictif)",
    });
    expect(signature.verifiedEmail).toMatch(/^lucja\d+@exemple\.test$/);
    expect(signature.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(signature.ipHash).not.toContain("203.0.113.9");
    expect(storage.files.get(signature.imageKey)).toBeDefined();
  });

  it("the code e-mail holds the code and the first name only; wrong, expired, locked codes", async () => {
    const c = await submittedCandidate();
    const now = tick();
    const mail = inbox();
    const sent = await requestSignatureCode(
      db,
      { personId: c.personId, role: "VOLUNTEER" },
      mail,
      now,
    );
    expect(sent.sentTo).toMatch(/@exemple\.test$/);
    const message = mail.sent[0];
    expect(message?.to).toMatch(/^lucja\d+@exemple\.test$/);
    expect(message?.text).toContain("Bonjour Łucja,");
    expect(message?.text).not.toMatch(/Ñúñez|Kraków|06 39/);
    const row = await db.otpChallenge.findFirstOrThrow({
      where: { submission: { personId: c.personId } },
    });
    expect(row.codeHash).not.toContain(codeOf(message));

    // Too soon for a new code.
    await expect(
      requestSignatureCode(
        db,
        { personId: c.personId, role: "VOLUNTEER" },
        inbox(),
        new Date(now.getTime() + 20_000),
      ),
    ).rejects.toThrow(/dans 40 secondes/);

    const wrong = codeOf(message) === "000000" ? "000001" : "000000";
    const attempt = (code: string, at = now) =>
      signWithCode(
        db,
        storage,
        {
          personId: c.personId,
          linkId: c.linkId,
          role: "VOLUNTEER",
          png,
          inputKind: "TYPED",
          code,
        },
        meta,
        new Date(at.getTime() + 1000),
      );
    await expect(attempt(wrong)).rejects.toThrow("Code incorrect. Il te reste 4 essais.");
    for (let i = 0; i < 3; i++) await expect(attempt(wrong)).rejects.toThrow(/Code incorrect/);
    await expect(attempt(wrong)).rejects.toThrow(
      "Code incorrect. Trop d'essais : demande un nouveau code.",
    );
    // Locked: even the right code is refused now.
    await expect(attempt(codeOf(message))).rejects.toThrow(
      "Trop d'essais : demande un nouveau code.",
    );

    // A new code, typed too late.
    const later = new Date(now.getTime() + 120_000);
    const second = inbox();
    await requestSignatureCode(db, { personId: c.personId, role: "VOLUNTEER" }, second, later);
    await expect(
      attempt(codeOf(second.sent[0]), new Date(later.getTime() + 10 * 60_000)),
    ).rejects.toThrow("Ce code a expiré : demande un nouveau code.");
    expect(await db.signature.count({ where: { submission: { personId: c.personId } } })).toBe(0);
  });

  it("refuses an empty trace, and never signs out of order", async () => {
    const c = await submittedCandidate(true);
    const mail = inbox();
    const now = tick();
    await requestSignatureCode(db, { personId: c.personId, role: "VOLUNTEER" }, mail, now);
    await expect(
      signWithCode(
        db,
        storage,
        {
          personId: c.personId,
          linkId: c.linkId,
          role: "VOLUNTEER",
          png: signaturePng(300, 100, false),
          inputKind: "DRAWN",
          code: codeOf(mail.sent[0]),
        },
        meta,
        now,
      ),
    ).rejects.toThrow(/vide/);
    await expect(
      requestSignatureCode(db, { personId: c.personId, role: "PARENT" }, inbox(), tick()),
    ).rejects.toThrow(/pas attendue/);
  });

  it("storage down: nothing is recorded, clear message", async () => {
    const c = await submittedCandidate();
    const mail = inbox();
    const now = tick();
    await requestSignatureCode(db, { personId: c.personId, role: "VOLUNTEER" }, mail, now);
    await expect(
      signWithCode(
        db,
        memoryStorage({ failPut: true }),
        {
          personId: c.personId,
          linkId: c.linkId,
          role: "VOLUNTEER",
          png,
          inputKind: "DRAWN",
          code: codeOf(mail.sent[0]),
        },
        meta,
        now,
      ),
    ).rejects.toThrow(/stockage des documents est injoignable/);
    expect(await db.signature.count({ where: { submission: { personId: c.personId } } })).toBe(0);
  });
});

describe("minor and counter-signature", () => {
  it("full journey: volunteer, guardian, counter-signature, documents, proof, e-mail, GAIA", async () => {
    const c = await submittedCandidate(true);
    expect((await signByCode(c, "VOLUNTEER", tick())).next).toBe("PARENT");
    // The link stays open until the guardian signs.
    expect(linkState(await db.dossierLink.findUniqueOrThrow({ where: { id: c.linkId } }))).toBe(
      "active",
    );
    let block = await signatureBlock(db, who("diamant"), c.personId, c.facts);
    expect(block.stage).toBe("volunteer_signed");
    // Not before the guardian.
    await expect(
      countersign(
        db,
        storage,
        who("diamant"),
        c.facts,
        {
          personId: c.personId,
          png,
          inputKind: "DRAWN",
          firstName: "Camille",
          lastName: "Fictif",
          quality: "DIAMANT",
        },
        meta,
        inbox(),
        tick(),
      ),
    ).rejects.toThrow(
      "Le représentant légal n'a pas encore signé : pas de contresignature possible.",
    );

    const guardianMail = inbox();
    const at = tick();
    await requestSignatureCode(db, { personId: c.personId, role: "PARENT" }, guardianMail, at);
    expect(guardianMail.sent[0]?.to).toMatch(/^dominika\d+@exemple\.test$/);
    expect(guardianMail.sent[0]?.text).toContain("Bonjour Dominika,");
    await signWithCode(
      db,
      storage,
      {
        personId: c.personId,
        linkId: c.linkId,
        role: "PARENT",
        png,
        inputKind: "TYPED",
        code: codeOf(guardianMail.sent[0]),
      },
      meta,
      at,
    );
    expect(linkState(await db.dossierLink.findUniqueOrThrow({ where: { id: c.linkId } }))).toBe(
      "used",
    );
    block = await signatureBlock(db, who("diamant"), c.personId, c.facts);
    expect(block.stage).toBe("to_countersign");

    const before = await db.accessLog.count({
      where: { personId: c.personId, context: "signature" },
    });
    const outcome = await countersign(
      db,
      storage,
      who("diamant"),
      c.facts,
      {
        personId: c.personId,
        png,
        inputKind: "DRAWN",
        firstName: "Camille",
        lastName: "Fictif",
        quality: "DIAMANT · Animation des équipes",
      },
      meta,
      logMail(db, who("diamant").userId),
      tick(),
    );
    expect(outcome.mailSent).toBe(true);
    expect(outcome.documentIds).toHaveLength(4);
    expect(
      await db.accessLog.count({ where: { personId: c.personId, context: "signature" } }),
    ).toBe(before + 1);

    // Documents: UL copies, flattened, hashes matching the proof.
    const documents = await db.document.findMany({
      where: { personId: c.personId, submissionId: { not: null } },
      orderBy: { createdAt: "asc" },
    });
    expect(documents.map((d) => [d.kind, d.copy])).toEqual([
      ["DOSSIER", "UL"],
      ["CHARTE", "UL"],
      ["APTITUDE", "UL"],
      ["OTHER", "UL"],
    ]);
    const signatures = await db.signature.findMany({
      where: { submission: { personId: c.personId } },
    });
    expect(signatures.map((s) => s.signerRole).sort()).toEqual([
      "CRF_REPRESENTATIVE",
      "PARENT",
      "VOLUNTEER",
    ]);
    const crf = signatures.find((s) => s.signerRole === "CRF_REPRESENTATIVE");
    expect(crf).toMatchObject({ method: "SESSION", verifiedByName: who("diamant").name });
    for (const document of documents) {
      const bytes = storage.files.get(document.storageKey);
      if (!bytes) throw new Error("file");
      expect(sha256(bytes)).toBe(document.sha256);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getForm().getFields()).toHaveLength(0);
      if (document.kind !== "OTHER") {
        for (const s of signatures) {
          expect((s.documentHashes as Record<string, string>)[document.fileName]).toBe(
            document.sha256,
          );
        }
      }
    }
    const charte = documents.find((d) => d.kind === "CHARTE");
    const charteText = (
      await pdfText(storage.files.get(charte?.storageKey ?? "") ?? Buffer.alloc(0))
    ).join(" ");
    for (const value of [
      "Łucja",
      "Dominika",
      "Camille",
      "Fictif",
      "Versailles",
      "Paul Fictif / Père",
    ]) {
      expect(charteText).toContain(value);
    }
    const proof = documents.find((d) => d.kind === "OTHER");
    const proofText = (
      await pdfText(storage.files.get(proof?.storageKey ?? "") ?? Buffer.alloc(0))
    ).join(" ");
    expect(proofText).toContain("Code reçu par e-mail");
    expect(proofText).toContain("Session du responsable");
    expect(proofText).toContain(documents[0]?.sha256 ?? "x");

    // E-mail to the volunteer and the guardian: 3 PDF + règlement + code de conduite.
    const outbound = await db.outboundMail.findFirstOrThrow({
      where: { to: { contains: "lucja" } },
      orderBy: { createdAt: "desc" },
    });
    expect(outbound.to).toMatch(/lucja\d+@exemple\.test, dominika\d+@exemple\.test/);
    const attachments = outbound.attachments as {
      filename: string;
      size: number;
      sha256: string;
    }[];
    expect(attachments.map((a) => a.filename)).toEqual([
      ...documents.filter((d) => d.kind !== "OTHER").map((d) => d.fileName),
      "Règlement du bénévolat.pdf",
      "Code de conduite (déc. 2024).pdf",
    ]);
    expect(attachments.slice(0, 3).map((a) => a.sha256)).toEqual(
      documents.filter((d) => d.kind !== "OTHER").map((d) => d.sha256),
    );

    // SIGNED, candidacy moved to GAIA by the machine (with its event).
    const submission = await db.dossierSubmission.findFirstOrThrow({
      where: { personId: c.personId, status: "SIGNED" },
    });
    expect(submission.signedAt).not.toBeNull();
    expect(submission.mailSentAt).not.toBeNull();
    expect((await db.candidacy.findUniqueOrThrow({ where: { id: c.candidacyId } })).stage).toBe(
      "GAIA",
    );
    expect(
      await db.candidacyEvent.count({ where: { candidacyId: c.candidacyId, toStage: "GAIA" } }),
    ).toBe(1);
    expect((await signatureBlock(db, who("diamant"), c.personId, c.facts)).mail).toBe("sent");

    // A second counter-signature is refused, nothing doubled.
    await expect(
      countersign(
        db,
        storage,
        who("topaze"),
        c.facts,
        {
          personId: c.personId,
          png,
          inputKind: "DRAWN",
          firstName: "A",
          lastName: "B",
          quality: "C",
        },
        meta,
        inbox(),
        tick(),
      ),
    ).rejects.toThrow(/déjà contresigné/);
    expect(
      await db.document.count({ where: { personId: c.personId, submissionId: { not: null } } }),
    ).toBe(4);
  });

  it("two responsibles at the same time: the second is refused, no document doubled", async () => {
    const c = await submittedCandidate();
    await signByCode(c, "VOLUNTEER", tick());
    const run = (key: string) =>
      countersign(
        db,
        storage,
        who(key),
        c.facts,
        {
          personId: c.personId,
          png,
          inputKind: "DRAWN",
          firstName: "X",
          lastName: "Y",
          quality: "Z",
        },
        meta,
        inbox(),
        tick(),
      );
    const results = await Promise.allSettled([run("diamant"), run("topaze")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected");
    expect(refused?.status === "rejected" && String(refused.reason)).toMatch(
      /contresigné par un autre responsable|déjà contresigné/,
    );
    expect(
      await db.document.count({ where: { personId: c.personId, submissionId: { not: null } } }),
    ).toBe(4);
    expect(
      await db.signature.count({
        where: { submission: { personId: c.personId }, signerRole: "CRF_REPRESENTATIVE" },
      }),
    ).toBe(1);
  });

  it("storage down at counter-signature: nothing signed on the UL side; then the retry succeeds once", async () => {
    const c = await submittedCandidate();
    await signByCode(c, "VOLUNTEER", tick());
    const input = {
      personId: c.personId,
      png,
      inputKind: "DRAWN" as const,
      firstName: "Camille",
      lastName: "Fictif",
      quality: "DIAMANT",
    };
    // The volunteer's image is read from the working storage, writes fail.
    const failing = { ...storage, put: () => Promise.reject(new Error("panne")) };
    await expect(
      countersign(db, failing, who("diamant"), c.facts, input, meta, inbox(), tick()),
    ).rejects.toThrow(
      "Le stockage des documents est injoignable : rien n'a été signé côté unité locale. Réessaie plus tard.",
    );
    expect((await signatureBlock(db, who("diamant"), c.personId, c.facts)).stage).toBe(
      "to_countersign",
    );
    expect(
      await db.document.count({ where: { personId: c.personId, submissionId: { not: null } } }),
    ).toBe(0);
    await countersign(db, storage, who("diamant"), c.facts, input, meta, inbox(), tick());
    expect(
      await db.document.count({ where: { personId: c.personId, submissionId: { not: null } } }),
    ).toBe(4);
  });

  it("e-mail down: documents stored anyway, « Renvoyer l'e-mail » sends the same files, no duplicate", async () => {
    const c = await submittedCandidate();
    await signByCode(c, "VOLUNTEER", tick());
    const outcome = await countersign(
      db,
      storage,
      who("diamant"),
      c.facts,
      {
        personId: c.personId,
        png,
        inputKind: "DRAWN",
        firstName: "Camille",
        lastName: "Fictif",
        quality: "DIAMANT",
      },
      meta,
      brokenMail,
      tick(),
    );
    expect(outcome.mailSent).toBe(false);
    expect(outcome.mailMessage).toMatch(/Renvoyer l'e-mail/);
    expect((await signatureBlock(db, who("diamant"), c.personId, c.facts)).mail).toBe("failed");
    const documents = await db.document.findMany({
      where: { personId: c.personId, submissionId: { not: null } },
    });
    expect(documents).toHaveLength(4);

    const mail = inbox();
    const resent = await resendSignedDocuments(
      db,
      storage,
      who("diamant"),
      c.facts,
      c.personId,
      mail,
    );
    expect(resent.mailSent).toBe(true);
    expect(mail.sent[0]?.attachments).toHaveLength(5);
    expect(mail.sent[0]?.attachments?.slice(0, 3).map((a) => sha256(a.content))).toEqual(
      documents.filter((d) => d.kind !== "OTHER").map((d) => d.sha256),
    );
    expect((await signatureBlock(db, who("diamant"), c.personId, c.facts)).mail).toBe("sent");
    expect(
      await db.document.count({ where: { personId: c.personId, submissionId: { not: null } } }),
    ).toBe(4);
  });

  it("on-site mode: identity checked in person, no code, the method is in the proof", async () => {
    const c = await submittedCandidate();
    await expect(
      signInPerson(
        db,
        storage,
        who("diamant"),
        c.facts,
        {
          personId: c.personId,
          role: "VOLUNTEER",
          png,
          inputKind: "DRAWN",
          identityChecked: false,
        },
        meta,
        tick(),
      ),
    ).rejects.toThrow(/J'ai vérifié l'identité/);
    const view = await signInPerson(
      db,
      storage,
      who("diamant"),
      c.facts,
      { personId: c.personId, role: "VOLUNTEER", png, inputKind: "DRAWN", identityChecked: true },
      meta,
      tick(),
    );
    expect(view.next).toBe("DONE");
    const signature = await db.signature.findFirstOrThrow({
      where: { submission: { personId: c.personId } },
    });
    expect(signature).toMatchObject({
      method: "IN_PERSON",
      verifiedByName: who("diamant").name,
      otpChallengeId: null,
    });
    // ACTION has no dossier.manage.
    await expect(
      signInPerson(
        db,
        storage,
        who("action"),
        c.facts,
        { personId: c.personId, role: "VOLUNTEER", png, inputKind: "DRAWN", identityChecked: true },
        meta,
        tick(),
      ),
    ).rejects.toThrow();
  });

  it("a new link while waiting for signatures leads to the same submitted dossier, no new draft", async () => {
    const c = await submittedCandidate();
    await createDossierLink(db, who("diamant"), { personId: c.personId });
    expect(
      await db.dossierSubmission.count({ where: { personId: c.personId, status: "DRAFT" } }),
    ).toBe(0);
    expect((await candidateSigningView(db, c.personId))?.next).toBe("VOLUNTEER");
  });
});
