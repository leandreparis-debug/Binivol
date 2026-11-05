import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { newCandidateSchema, stageChangeSchema } from "@/lib/candidacyForms";
import type { DossierDraft } from "@/lib/dossierSchema";
import { loadActor } from "@/server/auth/loadActor";
import { loadDraft, saveDraft, submitDraft } from "@/server/dossier/store";
import { DomainError } from "@/server/errors";
import { logMail } from "@/server/mail";
import type { MailMessage, MailService } from "@/server/mail/types";
import { MailUnavailableError } from "@/server/mail/types";
import type { Actor } from "@/server/policy/types";
import { changeStage, createCandidate } from "@/server/services/candidacies";
import { createDossierLink, openDossierLink, openOnSite } from "@/server/services/dossiers";
import { memoryStorage } from "@/server/storage/memory";
import { getTestDb } from "@/test/db/testDatabase";
import { pdfText } from "@/test/pdfText";
import { fakeSignature } from "@/test/png";
import { sha256 } from "../../pdf/templates";
import {
  countersign,
  resendFinalMail,
  sendSignatureCode,
  signAsParty,
  signatureStatus,
  signingState,
} from "../signing";

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

/** Collects the e-mails instead of sending them. */
function inbox(options: { fail?: boolean } = {}): MailService & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    driver: "log",
    sent,
    send(message) {
      if (options.fail) return Promise.reject(new MailUnavailableError());
      sent.push(message);
      return Promise.resolve();
    },
  };
}

const codeOf = (message: MailMessage | undefined) => /(\d{6})/.exec(message?.text ?? "")?.[1] ?? "";

function dossier(first: string, last: string, birthDate: string, email: string): DossierDraft {
  return {
    identity: {
      civility: "MME",
      lastName: last,
      firstName: first,
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
      email,
    },
    crf: { alreadyVolunteer: false, hasNivol: false, hasCrfEmail: false },
    emergency: {
      civility: "M",
      lastName: "Fictif",
      firstName: "Paul",
      relationship: "Père",
      phone1: "06 39 98 43 21",
    },
    consent: { rgpd: true },
  };
}

/** A candidate at FILE with a submitted dossier (adult, or 15 years old with a guardian). */
async function submitted(options: { minor?: boolean } = {}) {
  n += 1;
  const first = n % 2 === 0 ? "Łucja" : "Lilou";
  const last = `Ñúñez-O'Brien${String(n)}`;
  const email = `signature${String(n)}@exemple.test`;
  const out = await createCandidate(
    db,
    who("diamant"),
    newCandidateSchema.parse({ firstName: first, lastName: last, email }),
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
  const draft = await loadDraft(db, out.personId);
  if (!draft) throw new Error("draft");
  const data = dossier(first, last, options.minor ? "2011-03-01" : "1995-04-12", email);
  const storage = memoryStorage();
  if (options.minor) {
    data.guardian = {
      lastName: last,
      firstName: "Dominique",
      quality: "Mère",
      phone: "06 39 98 00 03",
      email: `parent.${email}`,
    };
    const { addAttachment } = await import("@/server/dossier/store");
    await addAttachment(db, storage, {
      submissionId: draft.submissionId,
      kind: "PARENTAL_AUTH",
      fileName: "autorisation.pdf",
      bytes: new Uint8Array(Buffer.from("%PDF-1.7\n% fictif\n%%EOF\n")),
    });
  }
  await saveDraft(db, draft.submissionId, data);
  const result = await submitDraft(db, {
    submissionId: draft.submissionId,
    day,
    structure: "Unité locale de Versailles",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return {
    personId: out.personId,
    candidacyId: out.candidacyId,
    submissionId: draft.submissionId,
    link,
    email,
  };
}

async function signVolunteer(submissionId: string, storage = memoryStorage()) {
  const mail = inbox();
  await sendSignatureCode(db, mail, { submissionId, role: "VOLUNTEER" });
  return signAsParty(db, storage, {
    submissionId,
    role: "VOLUNTEER",
    verification: { kind: "code", code: codeOf(mail.sent[0]) },
    signature: { kind: "drawn", png },
    userAgent: "Vitest (fictif)",
    ip: "203.0.113.7",
  });
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

describe("signature codes", () => {
  it("the code mail holds only the first name and the code; the code is stored hashed", async () => {
    const s = await submitted();
    const mail = inbox();
    const state = await sendSignatureCode(db, mail, {
      submissionId: s.submissionId,
      role: "VOLUNTEER",
    });
    const message = mail.sent[0];
    const code = codeOf(message);
    expect(code).toMatch(/^\d{6}$/);
    expect(message?.to).toBe(s.email);
    expect(message?.text).toMatch(/^Bonjour (Lilou|Łucja),/);
    expect(message?.text).not.toMatch(/Ñúñez|rue|Versailles,|—/);
    const challenge = await db.otpChallenge.findFirstOrThrow({
      where: { submissionId: s.submissionId },
    });
    expect(challenge.codeHash).not.toContain(code);
    expect(state.code?.attemptsLeft).toBe(5);
    expect(state.nextSigner?.maskedEmail).toMatch(/^s\*+\d@exemple\.test$/);
  });

  it("refuses a second code within 60 s, then locks after 5 wrong codes", async () => {
    const s = await submitted();
    const mail = inbox();
    const t0 = new Date();
    await sendSignatureCode(db, mail, { submissionId: s.submissionId, role: "VOLUNTEER" }, t0);
    await expect(
      sendSignatureCode(
        db,
        mail,
        { submissionId: s.submissionId, role: "VOLUNTEER" },
        new Date(t0.getTime() + 10_000),
      ),
    ).rejects.toThrow(/Attends encore 50 s/);
    const wrong = codeOf(mail.sent[0]) === "000000" ? "111111" : "000000";
    const attempt = () =>
      signAsParty(db, memoryStorage(), {
        submissionId: s.submissionId,
        role: "VOLUNTEER",
        verification: { kind: "code", code: wrong },
        signature: { kind: "drawn", png },
        userAgent: null,
        ip: null,
      });
    for (let i = 4; i >= 1; i -= 1) {
      await expect(attempt()).rejects.toThrow(new RegExp(`reste ${String(i)} essai`));
    }
    await expect(attempt()).rejects.toThrow(/bloqué/);
    // Even the right code is refused now.
    await expect(
      signAsParty(db, memoryStorage(), {
        submissionId: s.submissionId,
        role: "VOLUNTEER",
        verification: { kind: "code", code: codeOf(mail.sent[0]) },
        signature: { kind: "drawn", png },
        userAgent: null,
        ip: null,
      }),
    ).rejects.toThrow(/bloqué/);
  });

  it("an expired code is refused with a clear message", async () => {
    const s = await submitted();
    const mail = inbox();
    const t0 = new Date(Date.now() - 11 * 60_000);
    await sendSignatureCode(db, mail, { submissionId: s.submissionId, role: "VOLUNTEER" }, t0);
    await expect(
      signAsParty(db, memoryStorage(), {
        submissionId: s.submissionId,
        role: "VOLUNTEER",
        verification: { kind: "code", code: codeOf(mail.sent[0]) },
        signature: { kind: "drawn", png },
        userAgent: null,
        ip: null,
      }),
    ).rejects.toThrow(/expiré/);
  });
});

describe("signature, countersignature and final documents", () => {
  it("adult: the link stays open until the signature, then the countersignature completes everything", async () => {
    const s = await submitted();
    // Sent, not signed: the link still opens (signature screen only).
    expect((await openDossierLink(db, s.link.token)).ok).toBe(true);
    const storage = memoryStorage();
    const signed = await signVolunteer(s.submissionId, storage);
    expect(signed.status).toBe("SIGNED");
    expect(await openDossierLink(db, s.link.token)).toEqual({ ok: false });
    const volunteer = await db.signature.findFirstOrThrow({
      where: { submissionId: s.submissionId, signerRole: "VOLUNTEER" },
    });
    expect(volunteer).toMatchObject({ method: "OTP_EMAIL", verifiedEmail: s.email });
    expect(volunteer.ipHash).toMatch(/^[0-9a-f]{64}$/);
    expect(volunteer.ipHash).not.toContain("203.0.113.7");
    expect(storage.files.has(volunteer.imageKey ?? "")).toBe(true);
    expect((await signatureStatus(db, s.personId))?.waitingFor).toBe("COUNTERSIGN");

    await db.outboundMail.deleteMany({});
    const result = await countersign(db, storage, logMail(db), who("diamant"), {
      submissionId: s.submissionId,
      signature: { kind: "drawn", png },
      quality: "Responsable de l'intégration",
    });
    expect(result.mailSent).toBe(true);
    const sub = await db.dossierSubmission.findUniqueOrThrow({ where: { id: s.submissionId } });
    expect(sub).toMatchObject({ status: "COMPLETE", countersignStartedAt: null });
    expect((await db.candidacy.findUniqueOrThrow({ where: { id: s.candidacyId } })).stage).toBe(
      "GAIA",
    );

    // UL copy: 3 PDF and the proof, flattened, hashes as in the proof.
    const docs = await db.document.findMany({
      where: { submissionId: s.submissionId, archivedAt: null },
      orderBy: { kind: "asc" },
    });
    expect(docs.map((d) => [d.kind, d.copy])).toEqual([
      ["DOSSIER", "UL"],
      ["CHARTE", "UL"],
      ["APTITUDE", "UL"],
      ["OTHER", "UL"],
    ]);
    const crf = await db.signature.findFirstOrThrow({
      where: { submissionId: s.submissionId, signerRole: "CRF_REPRESENTATIVE" },
    });
    expect(crf.method).toBe("SESSION");
    const hashes = crf.documentHashes as Record<string, string>;
    for (const d of docs) {
      const bytes = new Uint8Array(storage.files.get(d.storageKey) ?? []);
      expect(sha256(bytes)).toBe(d.sha256);
      const pdf = await PDFDocument.load(bytes);
      expect(pdf.getForm().getFields()).toHaveLength(0);
      if (d.kind !== "OTHER") expect(hashes[d.fileName]).toBe(d.sha256);
      const text = await pdfText(bytes);
      if (d.kind === "CHARTE") expect(text).toContain("Responsable de l'intégration");
      if (d.kind !== "OTHER") expect(text).toContain("Signé électroniquement le");
      if (d.kind === "OTHER") {
        expect(text).toContain("Preuve de signature");
        for (const other of docs.filter((x) => x.kind !== "OTHER"))
          expect(text).toContain(other.sha256);
      }
    }
    expect(docs[0]?.fileName).toMatch(/^ÑÚÑEZ-O'BRIEN\d+_(Lilou|Łucja)_Dossier-Bénévole\.pdf$/);

    // The e-mail: 3 PDF + règlement + code de conduite (log driver: names and sizes).
    const mails = await db.outboundMail.findMany();
    expect(mails).toHaveLength(1);
    const attachments = mails[0]?.attachments as { filename: string; size: number }[];
    expect(attachments.map((a) => a.filename)).toEqual([
      docs[0]?.fileName,
      docs[1]?.fileName,
      docs[2]?.fileName,
      "Règlement du bénévolat.pdf",
      "Code de conduite (déc. 2024).pdf",
    ]);
    expect(attachments.every((a) => a.size > 1000)).toBe(true);
  }, 60_000);

  it("minor: the guardian signs with her own code; no countersignature before", async () => {
    const s = await submitted({ minor: true });
    const storage = memoryStorage();
    const afterVolunteer = await signVolunteer(s.submissionId, storage);
    expect(afterVolunteer).toMatchObject({ status: "SUBMITTED", next: "PARENT" });
    expect((await signatureStatus(db, s.personId))?.waitingFor).toBe("PARENT");
    await expect(
      countersign(db, storage, inbox(), who("diamant"), {
        submissionId: s.submissionId,
        signature: { kind: "drawn", png },
        quality: "",
      }),
    ).rejects.toThrow(/toutes les signatures ne sont pas réunies/);
    const mail = inbox();
    await sendSignatureCode(
      db,
      mail,
      { submissionId: s.submissionId, role: "PARENT" },
      new Date(Date.now() + 61_000),
    );
    expect(mail.sent[0]?.to).toBe(`parent.${s.email}`);
    expect(mail.sent[0]?.text).toMatch(/^Bonjour Dominique,/);
    const done = await signAsParty(db, storage, {
      submissionId: s.submissionId,
      role: "PARENT",
      verification: { kind: "code", code: codeOf(mail.sent[0]) },
      signature: { kind: "typed", name: `Dominique Ñúñez-O'Brien${String(n)}` },
      userAgent: null,
      ip: null,
    });
    expect(done.status).toBe("SIGNED");
    const final = inbox();
    await countersign(db, storage, final, who("diamant"), {
      submissionId: s.submissionId,
      signature: { kind: "typed", name: "Maé Démo" },
      quality: "",
    });
    // Sent to the volunteer and to the guardian.
    expect(final.sent[0]?.to).toBe(`${s.email}, parent.${s.email}`);
    const charte = await db.document.findFirstOrThrow({
      where: { submissionId: s.submissionId, kind: "CHARTE" },
    });
    const text = await pdfText(new Uint8Array(storage.files.get(charte.storageKey) ?? []));
    expect(text).toContain("Dominique");
  }, 60_000);

  it("storage down: nothing is marked signed; retried later without a duplicate", async () => {
    const s = await submitted();
    const storage = memoryStorage();
    await signVolunteer(s.submissionId, storage);
    await expect(
      countersign(
        db,
        { ...storage, put: () => Promise.reject(new Error("panne (test)")) },
        inbox(),
        who("diamant"),
        {
          submissionId: s.submissionId,
          signature: { kind: "drawn", png },
          quality: "",
        },
      ),
    ).rejects.toThrow(/stockage des documents est indisponible/);
    const sub = await db.dossierSubmission.findUniqueOrThrow({ where: { id: s.submissionId } });
    expect(sub).toMatchObject({ status: "SIGNED", countersignStartedAt: null });
    expect(await db.document.count({ where: { submissionId: s.submissionId } })).toBe(0);
    expect(
      await db.signature.count({
        where: { submissionId: s.submissionId, signerRole: "CRF_REPRESENTATIVE" },
      }),
    ).toBe(0);
    await countersign(db, storage, inbox(), who("diamant"), {
      submissionId: s.submissionId,
      signature: { kind: "drawn", png },
      quality: "",
    });
    expect(await db.document.count({ where: { submissionId: s.submissionId } })).toBe(4);
  }, 60_000);

  it("e-mail down: the documents are kept, « Renvoyer l'e-mail » sends the stored copy", async () => {
    const s = await submitted();
    const storage = memoryStorage();
    await signVolunteer(s.submissionId, storage);
    const result = await countersign(db, storage, inbox({ fail: true }), who("diamant"), {
      submissionId: s.submissionId,
      signature: { kind: "drawn", png },
      quality: "",
    });
    expect(result.mailSent).toBe(false);
    const sub = await db.dossierSubmission.findUniqueOrThrow({ where: { id: s.submissionId } });
    expect(sub.status).toBe("COMPLETE");
    expect(sub.finalMailError).toMatch(/Renvoyer l'e-mail/);
    expect((await signatureStatus(db, s.personId))?.finalMailError).toBeTruthy();
    const again = inbox();
    expect(
      (await resendFinalMail(db, storage, again, who("diamant"), s.submissionId)).mailSent,
    ).toBe(true);
    expect(again.sent[0]?.attachments).toHaveLength(5);
    expect(await db.document.count({ where: { submissionId: s.submissionId } })).toBe(4);
    expect(
      (await db.dossierSubmission.findUniqueOrThrow({ where: { id: s.submissionId } }))
        .finalMailError,
    ).toBeNull();
  }, 60_000);

  it("two responsibles countersigning at once: the second is refused", async () => {
    const s = await submitted();
    const storage = memoryStorage();
    await signVolunteer(s.submissionId, storage);
    const run = (actor: Actor) =>
      countersign(db, storage, inbox(), actor, {
        submissionId: s.submissionId,
        signature: { kind: "drawn", png },
        quality: "",
      });
    const results = await Promise.allSettled([run(who("diamant")), run(who("topaze"))]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const refused = results.find((r) => r.status === "rejected");
    expect(refused?.status === "rejected" && refused.reason instanceof DomainError).toBe(true);
    expect(await db.document.count({ where: { submissionId: s.submissionId } })).toBe(4);
  }, 60_000);

  it("on-site: identity checked in person replaces the code, and is recorded", async () => {
    const s = await submitted();
    await openOnSite(db, who("diamant"), s.personId);
    await expect(
      signAsParty(db, memoryStorage(), {
        submissionId: s.submissionId,
        role: "VOLUNTEER",
        verification: { kind: "in-person", actor: who("diamant"), confirmed: false },
        signature: { kind: "drawn", png },
        userAgent: null,
        ip: null,
      }),
    ).rejects.toThrow(/J'ai vérifié l'identité/);
    const state = await signAsParty(db, memoryStorage(), {
      submissionId: s.submissionId,
      role: "VOLUNTEER",
      verification: { kind: "in-person", actor: who("diamant"), confirmed: true },
      signature: { kind: "drawn", png },
      userAgent: null,
      ip: null,
    });
    expect(state.status).toBe("SIGNED");
    const sig = await db.signature.findFirstOrThrow({ where: { submissionId: s.submissionId } });
    expect(sig).toMatchObject({ method: "IN_PERSON", verifiedById: who("diamant").userId });
  });

  it("an empty trace is refused", async () => {
    const s = await submitted();
    const mail = inbox();
    await sendSignatureCode(db, mail, { submissionId: s.submissionId, role: "VOLUNTEER" });
    const { makePng } = await import("@/test/png");
    await expect(
      signAsParty(db, memoryStorage(), {
        submissionId: s.submissionId,
        role: "VOLUNTEER",
        verification: { kind: "code", code: codeOf(mail.sent[0]) },
        signature: { kind: "drawn", png: new Uint8Array(makePng(300, 100, () => false)) },
        userAgent: null,
        ip: null,
      }),
    ).rejects.toThrow(/vide/);
    expect((await signingState(db, s.submissionId)).status).toBe("SUBMITTED");
  });
});
