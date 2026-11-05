import type { SignatureInput, SignerRole } from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import type { DossierDraft } from "@/lib/dossierSchema";
import { getEnv, isHostedDemo } from "@/lib/env";
import {
  PROFILE_LABELS,
  SIGNATURE_INPUT_LABELS,
  SIGNATURE_METHOD_LABELS,
  SIGNER_ROLE_LABELS,
} from "@/lib/labels";
import { withAudit, type Actor as AuditActor } from "../audit";
import type { Db, DbOrTx } from "../db";
import {
  CANDIDATE_ACTOR,
  DOSSIER_ALREADY_SIGNED,
  loadOwnSigningDossier,
  readSigningDossier,
  recordSignedDossier,
  setSignedMailState,
  signedDossierDocuments,
  signingState,
  type FinalDocument,
  type SigningDossier,
} from "../dossier/store";
import { DomainError, translateDbError } from "../errors";
import { getMail, type MailService } from "../mail";
import { signatureCodeMail, signedDossierMail } from "../mail/templates";
import { fillTemplate, type PdfSignatures } from "../pdf/fill";
import { contentDisposition, officialFileName, type OfficialDocument } from "../pdf/fileName";
import type { PdfInput, PdfPerson } from "../pdf/mappings";
import { buildProofPdf } from "../pdf/proof";
import {
  ATTACHMENT_NAMES,
  readAsset,
  sha256,
  TemplateIntegrityError,
  TEMPLATES,
  type TemplateKind,
} from "../pdf/templates";
import { authorize } from "../policy/can";
import type { Actor, PersonFacts } from "../policy/types";
import { changeStage } from "../services/candidacies";
import { dossierSettings } from "../settings";
import { newStorageKey, type StorageService } from "../storage";
import {
  canSendCode,
  challengeState,
  hashIp,
  hashOtpCode,
  newOtpCode,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  verifyOtpCode,
} from "./otp";
import { assertSignatureImage } from "./png";

/**
 * Electronic signature of the dossier (step 8, docs/signature.md).
 *
 * 1. The candidate signs (trace or typed name, then a code e-mailed to her),
 *    then the legal guardian of a minor (code on the guardian's e-mail). In
 *    the on-site mode, the signed-in responsible may check the identity in
 *    person instead of the code.
 * 2. A responsible (`dossier.manage`) counter-signs the charter. In order,
 *    resumable without duplicates: final generation → storage → proof and
 *    `Document` rows, SIGNED, candidacy FILE → GAIA (one transaction) →
 *    e-mail to the volunteer (« Renvoyer l'e-mail » when it fails).
 *
 * No external signing service: a simple electronic signature (eIDAS), whose
 * value comes from the bundle of evidence kept in `signatures` and in the
 * « Preuve de signature » PDF.
 */

export type CandidateRole = Extract<SignerRole, "VOLUNTEER" | "PARENT">;

export interface RequestMeta {
  userAgent: string | null;
  ip: string | null;
}

export const STORAGE_OFF_MESSAGE =
  "La signature n'est pas disponible sur cette démo : le stockage des documents n'est pas configuré. Rien n'a été enregistré.";

/** False on a hosted demo without document storage (ADR-035): signing is refused upfront. */
export function signatureStorageReady(): boolean {
  return !(isHostedDemo() && getEnv().STORAGE_DRIVER === "local");
}

function assertStorageReady(): void {
  if (!signatureStorageReady()) throw new DomainError("STORAGE_UNAVAILABLE", STORAGE_OFF_MESSAGE);
}

const auditActor = (actor: Actor): AuditActor => ({ userId: actor.userId, label: actor.name });

const trim = (v: string | undefined) => (v ?? "").trim();

function volunteerName(data: DossierDraft): { firstName: string; lastName: string } {
  return { firstName: trim(data.identity?.firstName), lastName: trim(data.identity?.lastName) };
}

function guardianName(data: DossierDraft): { firstName: string; lastName: string } {
  return { firstName: trim(data.guardian?.firstName), lastName: trim(data.guardian?.lastName) };
}

/** « c•••••@exemple.test »: enough to recognise one's address, not to read it. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}${"•".repeat(Math.max(3, Math.min(local.length - 1, 8)))}@${domain}`;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface SignatureRow {
  id: string;
  signerRole: SignerRole;
  signerName: string;
  signerQuality: string | null;
  imageKey: string;
  signedAt: Date;
  method: "OTP_EMAIL" | "IN_PERSON" | "SESSION";
  inputKind: SignatureInput;
  verifiedEmail: string | null;
  verifiedByName: string | null;
  userAgent: string | null;
  ipHash: string | null;
}

async function signaturesOf(db: DbOrTx, submissionId: string): Promise<SignatureRow[]> {
  return db.signature.findMany({
    where: { submissionId },
    orderBy: { signedAt: "asc" },
    select: {
      id: true,
      signerRole: true,
      signerName: true,
      signerQuality: true,
      imageKey: true,
      signedAt: true,
      method: true,
      inputKind: true,
      verifiedEmail: true,
      verifiedByName: true,
      userAgent: true,
      ipHash: true,
    },
  });
}

/** Who signs next on the candidate side, or DONE once the volunteer (and the guardian) signed. */
export function nextCandidateSigner(
  minor: boolean,
  roles: readonly SignerRole[],
): CandidateRole | "DONE" {
  if (!roles.includes("VOLUNTEER")) return "VOLUNTEER";
  if (minor && !roles.includes("PARENT")) return "PARENT";
  return "DONE";
}

export const DOCUMENTS: {
  key: "dossier" | "charte" | "attestation";
  kind: TemplateKind;
  label: string;
}[] = [
  { key: "dossier", kind: "DOSSIER", label: "Dossier bénévole" },
  { key: "charte", kind: "CHARTE", label: "Charte du bénévolat" },
  { key: "attestation", kind: "APTITUDE", label: "Attestation d'aptitude" },
];

export type DocumentKey = (typeof DOCUMENTS)[number]["key"];

export interface SigningDocument {
  key: DocumentKey;
  label: string;
  fileName: string;
}

export interface SigningView {
  submissionId: string;
  minor: boolean;
  next: CandidateRole | "DONE";
  /** Name of the next signer (the typed-name alternative starts from it). */
  signerName: string;
  /** Name of the legal guardian (minor), for her own turn. */
  guardianName: string;
  /** Masked e-mail that receives the code, or null (no e-mail: in person only). */
  codeTo: string | null;
  signed: { role: SignerRole; signedAt: Date }[];
  documents: SigningDocument[];
  storageReady: boolean;
}

function viewOf(dossier: SigningDossier, signatures: SignatureRow[]): SigningView {
  const next = nextCandidateSigner(
    dossier.minor,
    signatures.map((s) => s.signerRole),
  );
  const v = volunteerName(dossier.data);
  const g = guardianName(dossier.data);
  const email =
    next === "PARENT" ? trim(dossier.data.guardian?.email) : trim(dossier.data.contact?.email);
  const name = next === "PARENT" ? g : v;
  return {
    submissionId: dossier.submissionId,
    minor: dossier.minor,
    next,
    signerName: `${name.firstName} ${name.lastName}`.trim(),
    guardianName: dossier.minor ? `${g.firstName} ${g.lastName}`.trim() : "",
    codeTo: email ? maskEmail(email) : null,
    signed: signatures.map((s) => ({ role: s.signerRole, signedAt: s.signedAt })),
    documents: DOCUMENTS.map((d) => ({
      key: d.key,
      label: d.label,
      fileName: officialFileName(v.lastName, v.firstName, d.kind as OfficialDocument),
    })),
    storageReady: signatureStorageReady(),
  };
}

/** The candidate's signature screens (her own dossier, no access log). */
export async function candidateSigningView(
  db: DbOrTx,
  personId: string,
): Promise<SigningView | null> {
  const dossier = await loadOwnSigningDossier(db, personId);
  if (dossier?.status !== "SUBMITTED") return null;
  return viewOf(dossier, await signaturesOf(db, dossier.submissionId));
}

/** The same screens in the on-site mode (responsible's session, journaled read). */
export async function onSiteSigningView(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
): Promise<SigningView | null> {
  const dossier = await readSigningDossier(db, actor, personId, facts, "signature (sur place)");
  if (dossier?.status !== "SUBMITTED") return null;
  return viewOf(dossier, await signaturesOf(db, dossier.submissionId));
}

async function currentSubmitted(db: DbOrTx, personId: string): Promise<SigningDossier> {
  const dossier = await loadOwnSigningDossier(db, personId);
  if (!dossier) throw new DomainError("INVALID_DATA", "Aucun dossier envoyé à signer.");
  if (dossier.status !== "SUBMITTED") {
    throw new DomainError("INVALID_DATA", "Ce dossier est déjà signé.");
  }
  return dossier;
}

// ---------------------------------------------------------------------------
// Code
// ---------------------------------------------------------------------------

/**
 * E-mails a new code to the next signer (the volunteer, then the guardian of
 * a minor). Refused within 60 s of the same signer's previous code, and
 * beyond 5 per hour for the dossier. The e-mail holds the code and the first name only.
 */
export async function requestSignatureCode(
  db: Db,
  input: { personId: string; role: CandidateRole },
  mail: MailService = getMail(db),
  now: Date = new Date(),
): Promise<{ sentTo: string; expiresAt: Date }> {
  assertStorageReady();
  const dossier = await currentSubmitted(db, input.personId);
  const signatures = await signaturesOf(db, dossier.submissionId);
  const next = nextCandidateSigner(
    dossier.minor,
    signatures.map((s) => s.signerRole),
  );
  if (next !== input.role) {
    throw new DomainError(
      "INVALID_DATA",
      "Cette signature n'est pas attendue : actualise la page.",
    );
  }
  const email =
    input.role === "PARENT"
      ? trim(dossier.data.guardian?.email)
      : trim(dossier.data.contact?.email);
  if (!email) {
    throw new DomainError(
      "INVALID_DATA",
      "Aucune adresse e-mail pour recevoir le code : la signature se fait sur place, avec un responsable de l'unité locale.",
    );
  }
  const previous = await db.otpChallenge.findMany({
    where: { submissionId: dossier.submissionId },
    select: { createdAt: true, signerRole: true },
  });
  const decision = canSendCode(
    previous.filter((p) => p.signerRole === input.role).map((p) => p.createdAt),
    previous.map((p) => p.createdAt),
    now,
  );
  if (!decision.ok) throw new DomainError("OTP_RATE_LIMITED", decision.message);

  const code = newOtpCode();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
  const challenge = await withAudit(db, CANDIDATE_ACTOR, async (tx, audit) => {
    const row = await tx.otpChallenge.create({
      data: {
        submissionId: dossier.submissionId,
        signerRole: input.role,
        codeHash: hashOtpCode(code),
        email,
        expiresAt,
        createdAt: now,
      },
    });
    audit.created("OtpChallenge", row.id, row);
    return row;
  });
  const { ulName } = await dossierSettings(db);
  const name = input.role === "PARENT" ? guardianName(dossier.data) : volunteerName(dossier.data);
  try {
    await mail.send({
      to: email,
      ...signatureCodeMail({
        firstName: name.firstName,
        code,
        ulName,
        forGuardian: input.role === "PARENT",
      }),
    });
  } catch (error) {
    // The code never left: void it, so it does not count as a valid challenge.
    await db.otpChallenge.update({ where: { id: challenge.id }, data: { expiresAt: now } });
    throw new DomainError(
      "MAIL_UNAVAILABLE",
      "Le code n'a pas pu être envoyé pour le moment. Réessaie dans quelques minutes.",
      { cause: error },
    );
  }
  return { sentTo: maskEmail(email), expiresAt };
}

/** Checks the code of the latest challenge of the role; counts the attempt. */
async function checkCode(
  db: Db,
  submissionId: string,
  role: CandidateRole,
  code: string,
  now: Date,
): Promise<{ id: string; email: string }> {
  const challenge = await db.otpChallenge.findFirst({
    where: { submissionId, signerRole: role },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) throw new DomainError("OTP_INVALID", "Demande d'abord un code.");
  const state = challengeState(challenge, now);
  if (state === "locked") {
    throw new DomainError("OTP_INVALID", "Trop d'essais : demande un nouveau code.");
  }
  if (state === "expired") {
    throw new DomainError("OTP_INVALID", "Ce code a expiré : demande un nouveau code.");
  }
  if (state === "verified") {
    throw new DomainError("OTP_INVALID", "Ce code a déjà servi : demande un nouveau code.");
  }
  if (!verifyOtpCode(code.trim(), challenge.codeHash)) {
    const updated = await db.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    const left = OTP_MAX_ATTEMPTS - updated.attempts;
    throw new DomainError(
      "OTP_INVALID",
      left > 0
        ? `Code incorrect. Il te reste ${String(left)} essai${left > 1 ? "s" : ""}.`
        : "Code incorrect. Trop d'essais : demande un nouveau code.",
    );
  }
  return { id: challenge.id, email: challenge.email };
}

// ---------------------------------------------------------------------------
// Candidate side
// ---------------------------------------------------------------------------

async function storeSignatureImage(storage: StorageService, png: Uint8Array): Promise<string> {
  const key = newStorageKey("png", "signatures");
  try {
    await storage.put(key, Buffer.from(png), "image/png");
  } catch (error) {
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Le stockage des documents est injoignable : la signature n'a pas été enregistrée. Réessaie dans quelques minutes.",
      { cause: error },
    );
  }
  return key;
}

interface SignInput {
  personId: string;
  role: CandidateRole;
  png: Uint8Array;
  inputKind: SignatureInput;
}

/**
 * Records a candidate-side signature (volunteer or guardian). The image is
 * checked and stored, then the signature written; once the candidate side is
 * complete, the link is marked used (it opens nothing any more).
 */
async function recordCandidateSignature(
  db: Db,
  storage: StorageService,
  input: SignInput,
  proof: {
    method: "OTP_EMAIL" | "IN_PERSON";
    challengeId: string | null;
    verifiedEmail: string | null;
    verifiedByName: string | null;
    auditActor: AuditActor;
    meta: RequestMeta;
    linkId: string | null;
  },
  dossier: SigningDossier,
  now: Date,
): Promise<SigningView> {
  const key = await storeSignatureImage(storage, input.png);
  const name = input.role === "PARENT" ? guardianName(dossier.data) : volunteerName(dossier.data);
  try {
    await withAudit(db, proof.auditActor, async (tx, audit) => {
      if (proof.challengeId) {
        await tx.otpChallenge.update({
          where: { id: proof.challengeId },
          data: { verifiedAt: now },
        });
      }
      const row = await tx.signature.create({
        data: {
          submissionId: dossier.submissionId,
          signerRole: input.role,
          signerName: `${name.firstName} ${name.lastName}`.trim(),
          signerQuality:
            input.role === "PARENT" ? trim(dossier.data.guardian?.quality) || null : "Bénévole",
          imageKey: key,
          signedAt: now,
          otpChallengeId: proof.challengeId,
          method: proof.method,
          inputKind: input.inputKind,
          verifiedEmail: proof.verifiedEmail,
          verifiedByName: proof.verifiedByName,
          userAgent: proof.meta.userAgent?.slice(0, 300) ?? null,
          ipHash: hashIp(proof.meta.ip),
          createdById: proof.auditActor.userId,
          updatedById: proof.auditActor.userId,
        },
      });
      audit.created("Signature", row.id, row);
      const roles = [
        ...(await tx.signature.findMany({
          where: { submissionId: dossier.submissionId },
          select: { signerRole: true },
        })),
      ].map((s) => s.signerRole);
      if (nextCandidateSigner(dossier.minor, roles) === "DONE") {
        // ADR-045: the link is consumed at the complete signature, no longer at submission.
        const linkIds = [...new Set([proof.linkId, dossier.linkId].filter((v) => v !== null))];
        for (const linkId of linkIds) {
          const { count } = await tx.dossierLink.updateMany({
            where: { id: linkId, usedAt: null },
            data: { usedAt: now },
          });
          if (count > 0) {
            audit.log({
              action: "UPDATE",
              entity: "DossierLink",
              entityId: linkId,
              field: "usedAt",
              newValue: now,
            });
          }
        }
      }
    });
  } catch (error) {
    await storage.delete(key).catch(() => undefined);
    throw translateDbError(error);
  }
  return viewOf(dossier, await signaturesOf(db, dossier.submissionId));
}

/** The candidate (or the guardian) signs with the e-mailed code. */
export async function signWithCode(
  db: Db,
  storage: StorageService,
  input: SignInput & { code: string; linkId: string | null },
  meta: RequestMeta,
  now: Date = new Date(),
): Promise<SigningView> {
  assertStorageReady();
  assertSignatureImage(input.png);
  const dossier = await currentSubmitted(db, input.personId);
  const roles = (await signaturesOf(db, dossier.submissionId)).map((s) => s.signerRole);
  if (nextCandidateSigner(dossier.minor, roles) !== input.role) {
    throw new DomainError(
      "INVALID_DATA",
      "Cette signature n'est pas attendue : actualise la page.",
    );
  }
  const challenge = await checkCode(db, dossier.submissionId, input.role, input.code, now);
  return recordCandidateSignature(
    db,
    storage,
    input,
    {
      method: "OTP_EMAIL",
      challengeId: challenge.id,
      verifiedEmail: challenge.email,
      verifiedByName: null,
      auditActor: CANDIDATE_ACTOR,
      meta,
      linkId: input.linkId,
    },
    dossier,
    now,
  );
}

/**
 * On-site mode: the signed-in responsible checked the identity in person
 * (box « J'ai vérifié l'identité de la personne »): no code. The method
 * (IN_PERSON) and the responsible's name go into the proof.
 */
export async function signInPerson(
  db: Db,
  storage: StorageService,
  actor: Actor,
  facts: PersonFacts,
  input: SignInput & { identityChecked: boolean },
  meta: RequestMeta,
  now: Date = new Date(),
): Promise<SigningView> {
  authorize(actor, "dossier.manage", { person: facts });
  assertStorageReady();
  if (!input.identityChecked) {
    throw new DomainError(
      "INVALID_DATA",
      "Coche « J'ai vérifié l'identité de la personne », ou envoie-lui un code.",
    );
  }
  assertSignatureImage(input.png);
  const dossier = await currentSubmitted(db, input.personId);
  const roles = (await signaturesOf(db, dossier.submissionId)).map((s) => s.signerRole);
  if (nextCandidateSigner(dossier.minor, roles) !== input.role) {
    throw new DomainError(
      "INVALID_DATA",
      "Cette signature n'est pas attendue : actualise la page.",
    );
  }
  return recordCandidateSignature(
    db,
    storage,
    input,
    {
      method: "IN_PERSON",
      challengeId: null,
      verifiedEmail: null,
      verifiedByName: actor.name,
      auditActor: { userId: actor.userId, label: `${actor.name} (sur place)` },
      meta,
      linkId: null,
    },
    dossier,
    now,
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

function pdfInput(
  dossier: SigningDossier,
  settings: { ulName: string; ulCity: string },
  signatures: SignatureRow[],
  representative: PdfPerson | null,
): PdfInput {
  const volunteer = signatures.find((s) => s.signerRole === "VOLUNTEER");
  return {
    data: dossier.data,
    structure: trim(dossier.data.structure) || settings.ulName,
    city: settings.ulCity,
    signedOn: volunteer?.signedAt ?? null,
    representative,
    nivol: null,
  };
}

function templateError(error: unknown): never {
  if (error instanceof TemplateIntegrityError) {
    throw new DomainError("TEMPLATE_MODIFIED", error.message, { cause: error });
  }
  throw error;
}

/**
 * Preview of one document **before signature**, generated on the fly and never
 * stored (marked « Aperçu »). Candidate: her own dossier. Responsible: the
 * read is journaled.
 */
export async function previewDocument(
  db: DbOrTx,
  who: { personId: string } & ({ candidate: true } | { actor: Actor; facts: PersonFacts }),
  key: DocumentKey,
): Promise<{ fileName: string; bytes: Uint8Array; disposition: string }> {
  const dossier =
    "candidate" in who
      ? await loadOwnSigningDossier(db, who.personId)
      : await readSigningDossier(db, who.actor, who.personId, who.facts, "aperçu des documents");
  if (!dossier) throw new DomainError("INVALID_DATA", "Aucun dossier envoyé.");
  const document = DOCUMENTS.find((d) => d.key === key);
  if (!document) throw new DomainError("INVALID_DATA", "Document inconnu.");
  const settings = await dossierSettings(db);
  const v = volunteerName(dossier.data);
  const bytes = await fillTemplate(
    document.kind,
    { ...pdfInput(dossier, settings, [], null), signedOn: null },
    {},
    { preview: true },
  ).catch(templateError);
  const fileName = `Aperçu_${officialFileName(v.lastName, v.firstName, document.kind)}`;
  return { fileName, bytes, disposition: contentDisposition(fileName, "inline") };
}

// ---------------------------------------------------------------------------
// Counter-signature
// ---------------------------------------------------------------------------

/** Default quality of the representative: the label of the responsible's profile. */
export function defaultQuality(actor: Pick<Actor, "profiles">): string {
  const order = ["DIAMANT", "TOPAZE", "ACTION", "LASER", "FORMAT", "FORMAT_GP"] as const;
  const profile = order.find((p) => actor.profiles.has(p));
  return profile ? PROFILE_LABELS[profile] : "Responsable de l'unité locale";
}

/** « Camille Fictif » → first name « Camille », last name « Fictif » (editable in the dialog). */
export function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return { firstName: name.trim(), lastName: "" };
  return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) ?? "" };
}

export interface CountersignInput {
  personId: string;
  png: Uint8Array;
  inputKind: SignatureInput;
  firstName: string;
  lastName: string;
  quality: string;
}

export interface CountersignOutcome {
  documentIds: string[];
  mailSent: boolean;
  mailMessage: string | null;
}

interface NamedFile {
  fileName: string;
  bytes: Uint8Array;
}

interface GeneratedDocument extends FinalDocument {
  bytes: Uint8Array;
}

/**
 * Counter-signature of the charter by a responsible, then the whole
 * completion. The Google session stands for the verification (no code).
 */
export async function countersign(
  db: Db,
  storage: StorageService,
  actor: Actor,
  facts: PersonFacts,
  input: CountersignInput,
  meta: RequestMeta,
  mail: MailService = getMail(db, actor.userId),
  now: Date = new Date(),
): Promise<CountersignOutcome> {
  authorize(actor, "dossier.manage", { person: facts });
  assertStorageReady();
  assertSignatureImage(input.png);
  const representative: PdfPerson = {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    quality: input.quality.trim(),
  };
  if (!representative.lastName || !representative.firstName || !representative.quality) {
    throw new DomainError("INVALID_DATA", "Le nom, le prénom et la qualité sont obligatoires.");
  }
  const dossier = await readSigningDossier(db, actor, input.personId, facts, "signature");
  if (!dossier) throw new DomainError("INVALID_DATA", "Aucun dossier envoyé.");
  if (dossier.status === "SIGNED") {
    throw new DomainError("DOSSIER_ALREADY_SIGNED", "Ce dossier est déjà contresigné.");
  }
  const signatures = await signaturesOf(db, dossier.submissionId);
  const next = nextCandidateSigner(
    dossier.minor,
    signatures.map((s) => s.signerRole),
  );
  if (next === "VOLUNTEER") {
    throw new DomainError(
      "INVALID_DATA",
      "Le bénévole n'a pas encore signé : pas de contresignature.",
    );
  }
  if (next === "PARENT") {
    throw new DomainError(
      "INVALID_DATA",
      "Le représentant légal n'a pas encore signé : pas de contresignature possible.",
    );
  }

  // 1. Final generation (nothing written yet).
  const settings = await dossierSettings(db);
  const images: PdfSignatures = {};
  try {
    for (const s of signatures) {
      if (s.signerRole === "VOLUNTEER" || s.signerRole === "PARENT") {
        images[s.signerRole] = { png: await storage.get(s.imageKey), signedAt: s.signedAt };
      }
    }
  } catch (error) {
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Le stockage des documents est injoignable : rien n'a été signé côté unité locale. Réessaie plus tard.",
      { cause: error },
    );
  }
  images.CRF_REPRESENTATIVE = { png: input.png, signedAt: now };
  const base = pdfInput(dossier, settings, signatures, representative);
  const v = volunteerName(dossier.data);
  const generated: GeneratedDocument[] = [];
  for (const d of DOCUMENTS) {
    const bytes = await fillTemplate(d.kind, base, images).catch(templateError);
    generated.push({
      kind: d.kind,
      bytes,
      fileName: officialFileName(v.lastName, v.firstName, d.kind),
      storageKey: newStorageKey("pdf"),
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
    });
  }
  const crf = {
    signerRole: "CRF_REPRESENTATIVE" as const,
    signerName: `${representative.firstName} ${representative.lastName}`,
    signerQuality: representative.quality,
    signedAt: now,
    method: "SESSION" as const,
    inputKind: input.inputKind,
    verifiedEmail: actor.email,
    verifiedByName: actor.name,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    ipHash: hashIp(meta.ip),
  };
  const proofBytes = await buildProofPdf({
    structure: base.structure,
    personRef: (
      await db.person.findUniqueOrThrow({ where: { id: input.personId }, select: { ref: true } })
    ).ref,
    personName: `${v.firstName} ${v.lastName.toLocaleUpperCase("fr-FR")}`,
    generatedAt: now,
    signers: [...signatures, crf].map((s) => ({
      role: SIGNER_ROLE_LABELS[s.signerRole],
      name: s.signerName,
      quality: s.signerQuality,
      signedAt: s.signedAt,
      method: SIGNATURE_METHOD_LABELS[s.method],
      verification:
        s.method === "OTP_EMAIL"
          ? `code envoyé à ${s.verifiedEmail ?? "(adresse inconnue)"}`
          : s.method === "IN_PERSON"
            ? `identité vérifiée en présence par ${s.verifiedByName ?? "un responsable"}`
            : `session Google de ${s.verifiedEmail ?? s.verifiedByName ?? "un responsable"}`,
      input: SIGNATURE_INPUT_LABELS[s.inputKind],
      userAgent: s.userAgent,
      ipHash: s.ipHash,
    })),
    files: generated.map((g) => ({ fileName: g.fileName, sha256: g.sha256 })),
  });
  generated.push({
    kind: "OTHER",
    bytes: proofBytes,
    fileName: officialFileName(v.lastName, v.firstName, "PROOF"),
    storageKey: newStorageKey("pdf"),
    sizeBytes: proofBytes.length,
    sha256: sha256(proofBytes),
  });
  const crfImageKey = newStorageKey("png", "signatures");

  // 2. Storage: all or nothing.
  const stored: string[] = [];
  try {
    await storage.put(crfImageKey, Buffer.from(input.png), "image/png");
    stored.push(crfImageKey);
    for (const g of generated) {
      await storage.put(g.storageKey, Buffer.from(g.bytes), "application/pdf");
      stored.push(g.storageKey);
    }
  } catch (error) {
    await Promise.all(stored.map((k) => storage.delete(k).catch(() => undefined)));
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Le stockage des documents est injoignable : rien n'a été signé côté unité locale. Réessaie plus tard.",
      { cause: error },
    );
  }

  // 3. Proof, documents, SIGNED, candidacy FILE → GAIA: one transaction.
  const hashes = Object.fromEntries(
    generated.filter((g) => g.kind !== "OTHER").map((g) => [g.fileName, g.sha256]),
  );
  let documentIds: string[];
  try {
    documentIds = await withAudit(db, auditActor(actor), async (tx, audit) => {
      const row = await tx.signature.create({
        data: {
          submissionId: dossier.submissionId,
          ...crf,
          imageKey: crfImageKey,
          documentHashes: hashes,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      audit.created("Signature", row.id, row);
      await tx.signature.updateMany({
        where: { submissionId: dossier.submissionId, id: { not: row.id } },
        data: { documentHashes: hashes },
      });
      const ids = await recordSignedDossier(tx, audit, actor.userId, {
        submissionId: dossier.submissionId,
        personId: input.personId,
        signedAt: now,
        documents: generated.map(({ bytes: _bytes, ...d }) => d),
      });
      const candidacy = await tx.candidacy.findFirst({
        where: { personId: input.personId, closedAt: null },
        select: { id: true, stage: true },
      });
      if (candidacy?.stage === "FILE") {
        await changeStage(
          tx,
          actor,
          {
            candidacyId: candidacy.id,
            expectedStage: "FILE",
            toStage: "GAIA",
            note: "Dossier signé et contresigné.",
            abandonReason: null,
            nextAction: "Créer le compte Gaia et le NIVOL",
            followUpAt: null,
          },
          toParisDay(now),
        );
      }
      return ids;
    });
  } catch (error) {
    await Promise.all(stored.map((k) => storage.delete(k).catch(() => undefined)));
    const translated = translateDbError(error);
    // A second responsible counter-signing at the same time: refused by the state check.
    if (translated instanceof DomainError && translated.code === "ALREADY_SIGNED") {
      throw new DomainError("DOSSIER_ALREADY_SIGNED", DOSSIER_ALREADY_SIGNED, { cause: error });
    }
    throw translated;
  }

  // 4. E-mail (the documents are stored whatever happens).
  const sent = await sendSignedDocuments(
    db,
    actor,
    dossier,
    generated
      .filter((g) => g.kind !== "OTHER")
      .map((g) => ({ fileName: g.fileName, bytes: g.bytes })),
    mail,
  );
  return { documentIds, mailSent: sent.ok, mailMessage: sent.ok ? null : sent.message };
}

const MAIL_FAILED =
  "Les documents sont signés et rangés, mais l'e-mail au bénévole n'est pas parti. Utilise « Renvoyer l'e-mail ».";

async function sendSignedDocuments(
  db: Db,
  actor: Actor,
  dossier: SigningDossier,
  documents: NamedFile[],
  mail: MailService,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const settings = await dossierSettings(db);
  const to = [trim(dossier.data.contact?.email)];
  if (dossier.minor) to.push(trim(dossier.data.guardian?.email));
  const recipients = [...new Set(to.filter(Boolean))];
  if (recipients.length === 0) {
    await setSignedMailState(db, auditActor(actor), dossier.submissionId, false);
    return {
      ok: false,
      message: "Aucune adresse e-mail dans le dossier : remets les documents en main propre.",
    };
  }
  try {
    const extras = await Promise.all(
      (["REGLEMENT", "CODE_CONDUITE"] as const).map(async (k) => ({
        fileName: ATTACHMENT_NAMES[k],
        bytes: await readAsset(TEMPLATES[k]),
      })),
    );
    const attachments = [...documents, ...extras];
    const message = signedDossierMail({
      template: settings.signedMail,
      firstName: volunteerName(dossier.data).firstName,
      ulName: settings.ulName,
      attachments: attachments.map((a) => a.fileName),
    });
    await mail.send({
      to: recipients.join(", "),
      ...message,
      attachments: attachments.map((a) => ({
        filename: a.fileName,
        content: Buffer.from(a.bytes),
        contentType: "application/pdf",
      })),
    });
  } catch {
    // Relay down or refused (MailUnavailableError), or anything else: the documents
    // stay stored, the block offers « Renvoyer l'e-mail ».
    await setSignedMailState(db, auditActor(actor), dossier.submissionId, false);
    return { ok: false, message: MAIL_FAILED };
  }
  await setSignedMailState(db, auditActor(actor), dossier.submissionId, true);
  return { ok: true };
}

/** « Renvoyer l'e-mail »: the stored final documents, sent again (never regenerated). */
export async function resendSignedDocuments(
  db: Db,
  storage: StorageService,
  actor: Actor,
  facts: PersonFacts,
  personId: string,
  mail: MailService = getMail(db, actor.userId),
): Promise<{ mailSent: boolean; mailMessage: string | null }> {
  authorize(actor, "dossier.manage", { person: facts });
  const dossier = await readSigningDossier(db, actor, personId, facts, "signature");
  if (dossier?.status !== "SIGNED") {
    throw new DomainError("INVALID_DATA", "Ce dossier n'est pas encore contresigné.");
  }
  const documents = (await signedDossierDocuments(db, dossier.submissionId)).filter(
    (d) => d.kind !== "OTHER",
  );
  if (documents.length !== 3 || documents.some((d) => d.fileMissing)) {
    throw new DomainError(
      "FILE_MISSING",
      "Les documents signés ne sont pas dans le stockage : l'e-mail ne peut pas être renvoyé.",
    );
  }
  let files: { fileName: string; bytes: Uint8Array }[];
  try {
    files = await Promise.all(
      documents.map(async (d) => ({
        fileName: d.fileName,
        bytes: await storage.get(d.storageKey),
      })),
    );
  } catch (error) {
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Le stockage des documents est injoignable. Réessaie plus tard.",
      { cause: error },
    );
  }
  const sent = await sendSignedDocuments(db, actor, dossier, files, mail);
  return { mailSent: sent.ok, mailMessage: sent.ok ? null : sent.message };
}

// ---------------------------------------------------------------------------
// « Dossier » block (Intégration tab)
// ---------------------------------------------------------------------------

export type SignatureStage =
  "none" | "submitted" | "volunteer_signed" | "parent_signed" | "to_countersign" | "complete";

export interface SignatureBlock {
  stage: SignatureStage;
  minor: boolean;
  mail: "sent" | "failed" | "pending" | null;
  signatures: { role: SignerRole; name: string; signedAt: Date; method: string }[];
  defaults: { firstName: string; lastName: string; quality: string };
  storageReady: boolean;
}

/** State of the signature, without any content of the dossier (`dossier.manage`). */
export async function signatureBlock(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
): Promise<SignatureBlock> {
  authorize(actor, "dossier.manage", { person: facts });
  const state = await signingState(db, personId);
  const defaults = { ...splitName(actor.name), quality: defaultQuality(actor) };
  if (!state) {
    return {
      stage: "none",
      minor: false,
      mail: null,
      signatures: [],
      defaults,
      storageReady: signatureStorageReady(),
    };
  }
  const signatures = await signaturesOf(db, state.submissionId);
  const roles = signatures.map((s) => s.signerRole);
  let stage: SignatureStage;
  if (state.status === "SIGNED") stage = "complete";
  else if (nextCandidateSigner(state.minor, roles) === "DONE") stage = "to_countersign";
  else if (roles.includes("PARENT")) stage = "parent_signed";
  else if (roles.includes("VOLUNTEER")) stage = "volunteer_signed";
  else stage = "submitted";
  return {
    stage,
    minor: state.minor,
    mail:
      state.status !== "SIGNED"
        ? null
        : state.mailSentAt
          ? "sent"
          : state.mailFailedAt
            ? "failed"
            : "pending",
    signatures: signatures.map((s) => ({
      role: s.signerRole,
      name: s.signerName,
      signedAt: s.signedAt,
      method: SIGNATURE_METHOD_LABELS[s.method],
    })),
    defaults,
    storageReady: signatureStorageReady(),
  };
}
