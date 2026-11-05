import { createHmac } from "node:crypto";
import type { SignatureMethod, SignerRole } from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import { dossierAge, migrateDossierData, type DossierDraft } from "@/lib/dossierSchema";
import { contentDisposition, documentFileName } from "@/lib/fileNames";
import { PROFILE_LABELS } from "@/lib/labels";
import { withAudit, type Actor as AuditActor } from "../audit";
import type { Db, DbOrTx } from "../db";
import { DomainError } from "../errors";
import { finalDocumentsMail, signatureCodeMail } from "../mail/templates";
import { MailUnavailableError, type MailService } from "../mail/types";
import { renderTemplate, type SignatureImage } from "../pdf/fill";
import { MAPPINGS } from "../pdf/mappings";
import { renderProof, type ProofSigner } from "../pdf/proof";
import {
  ENCLOSURES,
  loadEnclosure,
  loadFont,
  loadHandwriting,
  loadTemplate,
  sha256,
  TEMPLATES,
  type TemplateKey,
} from "../pdf/templates";
import type { Actor } from "../policy/types";
import { derivedKey } from "../secrets";
import { changeStage } from "../services/candidacies";
import { dossierSettings } from "../settings";
import {
  canSendCode,
  checkSignatureCode,
  CODE_TTL_MS,
  hashSignatureCode,
  newSignatureCode,
} from "../signature/code";
import { checkSignaturePng, checkTypedSignature } from "../signature/png";
import { newStorageKey, type StorageService } from "../storage";

/**
 * Electronic signature of a submitted dossier (step 8, docs/signature.md):
 * codes, signatures of the volunteer and of the legal guardian, the
 * countersignature of the charte, the generation and storage of the final
 * PDFs, the proof, the e-mail of the documents and the move to GAIA.
 *
 * Third module allowed to read dossiers (with sensitive.ts and store.ts,
 * architecture test): every write is audited, sensitive values masked.
 */

const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
const CLAIM_MS = 10 * 60 * 1000;
export type SignerParty = "VOLUNTEER" | "PARENT";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

async function loadSubmission(db: DbOrTx, submissionId: string) {
  const row = await db.dossierSubmission.findUnique({
    where: { id: submissionId },
    include: {
      signatures: { orderBy: { signedAt: "asc" } },
      otpChallenges: { orderBy: { createdAt: "desc" } },
      person: { select: { id: true, ref: true, firstName: true, lastName: true } },
    },
  });
  if (!row) throw new DomainError("INVALID_DATA", "Dossier introuvable.");
  const data = migrateDossierData(row.data, row.schemaVersion).data;
  const day = toParisDay(row.submittedAt ?? new Date());
  const age = dossierAge(data, day);
  const minor = age !== null && age < 18;
  return { row, data, minor };
}

type Loaded = Awaited<ReturnType<typeof loadSubmission>>;

const requiredRoles = (minor: boolean): SignerParty[] =>
  minor ? ["VOLUNTEER", "PARENT"] : ["VOLUNTEER"];

function party(data: DossierDraft, role: SignerParty) {
  const id = data.identity ?? {};
  const g = data.guardian ?? {};
  return role === "VOLUNTEER"
    ? {
        firstName: id.firstName ?? "",
        fullName: `${id.firstName ?? ""} ${id.lastName ?? ""}`.trim(),
        email: (data.contact?.email ?? "").trim(),
        quality: null,
      }
    : {
        firstName: g.firstName ?? "",
        fullName: `${g.firstName ?? ""} ${g.lastName ?? ""}`.trim(),
        email: (g.email ?? "").trim(),
        quality: g.quality ?? "Représentant légal",
      };
}

/** « c*****e@exemple.test »: enough to recognise one's address, no more. */
export function maskEmail(email: string): string {
  const [user = "", domain = ""] = email.split("@");
  if (!domain) return "";
  const shown =
    user.length <= 2
      ? (user[0] ?? "")
      : `${user[0] ?? ""}${"*".repeat(Math.min(5, user.length - 2))}${user.at(-1) ?? ""}`;
  return `${shown}@${domain}`;
}

export interface SigningState {
  submissionId: string;
  status: Loaded["row"]["status"];
  minor: boolean;
  required: SignerParty[];
  signed: { role: SignerRole; name: string; signedAt: Date; method: SignatureMethod }[];
  /** Who signs now (null once the volunteer and the guardian have signed). */
  next: SignerParty | null;
  nextSigner: { firstName: string; fullName: string; maskedEmail: string } | null;
  /** The pending code of the next signer, if one was sent. */
  code: { expiresAt: Date; attemptsLeft: number; resendInSeconds: number; locked: boolean } | null;
  documents: { key: TemplateKey; label: string; fileName: string }[];
}

function stateOf(loaded: Loaded, now: Date): SigningState {
  const { row, data, minor } = loaded;
  const required = requiredRoles(minor);
  const signedRoles = new Set(row.signatures.map((s) => s.signerRole));
  const next =
    row.status === "SUBMITTED" ? (required.find((r) => !signedRoles.has(r)) ?? null) : null;
  const challenge = next ? row.otpChallenges.find((c) => c.signerRole === next) : undefined;
  const sends = row.otpChallenges.map((c) => c.createdAt);
  const send = canSendCode(sends, now);
  const id = data.identity ?? {};
  return {
    submissionId: row.id,
    status: row.status,
    minor,
    required,
    signed: row.signatures.map((s) => ({
      role: s.signerRole,
      name: s.signerName,
      signedAt: s.signedAt,
      method: s.method,
    })),
    next,
    nextSigner: next
      ? {
          firstName: party(data, next).firstName,
          fullName: party(data, next).fullName,
          maskedEmail: maskEmail(party(data, next).email),
        }
      : null,
    code:
      challenge && !challenge.verifiedAt
        ? {
            expiresAt: challenge.expiresAt,
            attemptsLeft: Math.max(0, 5 - challenge.attempts),
            resendInSeconds: send.ok ? 0 : send.retryInSeconds,
            locked: challenge.attempts >= 5,
          }
        : null,
    documents: TEMPLATE_KEYS.map((key) => ({
      key,
      label: TEMPLATES[key].label,
      fileName: documentFileName(id.lastName ?? "", id.firstName ?? "", TEMPLATES[key].suffix),
    })),
  };
}

export async function signingState(
  db: DbOrTx,
  submissionId: string,
  now = new Date(),
): Promise<SigningState> {
  return stateOf(await loadSubmission(db, submissionId), now);
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

const SIGNING_ACTOR: AuditActor = { userId: null, label: "Signataire (dossier en ligne)" };

/**
 * Sends a 6-digit code to the next signer (her own e-mail). Refused when it
 * is not her turn, too soon after the last code (60 s) or after 5 codes in
 * the hour for this dossier.
 */
export async function sendSignatureCode(
  db: Db,
  mail: MailService,
  input: { submissionId: string; role: SignerParty },
  now = new Date(),
): Promise<SigningState> {
  const loaded = await loadSubmission(db, input.submissionId);
  const state = stateOf(loaded, now);
  if (state.next !== input.role) {
    throw new DomainError("SIGNATURE_STATE", "Ce n'est pas le moment de cette signature.");
  }
  const send = canSendCode(
    loaded.row.otpChallenges.map((c) => c.createdAt),
    now,
  );
  if (!send.ok) {
    throw new DomainError(
      "OTP_RATE_LIMITED",
      send.reason === "delay"
        ? `Attends encore ${String(send.retryInSeconds)} s avant de demander un nouveau code.`
        : `Trop de codes demandés : réessaie dans ${String(Math.ceil(send.retryInSeconds / 60))} min.`,
    );
  }
  const who = party(loaded.data, input.role);
  if (!who.email) throw new DomainError("INVALID_DATA", "Aucun e-mail pour envoyer le code.");
  const code = newSignatureCode();
  const { ulName } = await dossierSettings(db);
  await withAudit(db, SIGNING_ACTOR, async (tx, audit) => {
    const row = await tx.otpChallenge.create({
      data: {
        submissionId: input.submissionId,
        signerRole: input.role,
        codeHash: hashSignatureCode(code),
        email: who.email,
        createdAt: now,
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      },
    });
    audit.created("OtpChallenge", row.id, row);
  });
  try {
    await mail.send({
      to: who.email,
      ...signatureCodeMail({ firstName: who.firstName, code, ulName }),
    });
  } catch (error) {
    if (error instanceof MailUnavailableError) {
      throw new DomainError(
        "INVALID_DATA",
        "Le code n'a pas pu être envoyé pour le moment. Réessaie dans une minute.",
        { cause: error },
      );
    }
    throw error;
  }
  return stateOf(await loadSubmission(db, input.submissionId), now);
}

// ---------------------------------------------------------------------------
// Signatures of the volunteer and of the legal guardian
// ---------------------------------------------------------------------------

export type SignatureInput = { kind: "drawn"; png: Uint8Array } | { kind: "typed"; name: string };

export type Verification =
  { kind: "code"; code: string } | { kind: "in-person"; actor: Actor; confirmed: boolean };

export function ipHash(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHmac("sha256", derivedKey("ip-hash")).update(ip).digest("hex");
}

/**
 * Signature of the volunteer or of the legal guardian: code (or identity
 * checked in person by a signed-in responsible), drawn image (stored) or typed
 * name. When every required signer has signed, the dossier is SIGNED (to
 * countersign) and the link is marked used (ADR-044).
 */
export async function signAsParty(
  db: Db,
  storage: StorageService,
  input: {
    submissionId: string;
    role: SignerParty;
    verification: Verification;
    signature: SignatureInput;
    userAgent: string | null;
    ip: string | null;
  },
  now = new Date(),
): Promise<SigningState> {
  const loaded = await loadSubmission(db, input.submissionId);
  const state = stateOf(loaded, now);
  if (state.next !== input.role) {
    throw new DomainError("SIGNATURE_STATE", "Ce n'est pas le moment de cette signature.");
  }
  const who = party(loaded.data, input.role);

  // 1. Verification.
  let method: SignatureMethod = "OTP_EMAIL";
  let challengeId: string | null = null;
  let verifiedEmail: string | null = null;
  let verifiedById: string | null = null;
  if (input.verification.kind === "code") {
    const challenge = loaded.row.otpChallenges.find(
      (c) => c.signerRole === input.role && !c.verifiedAt,
    );
    if (!challenge) throw new DomainError("OTP_INVALID", "Demande d'abord un code.");
    const check = checkSignatureCode(challenge, input.verification.code, now);
    if (!check.ok) {
      if (check.reason !== "expired") {
        await db.otpChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
      }
      throw new DomainError(
        check.reason === "locked"
          ? "OTP_LOCKED"
          : check.reason === "expired"
            ? "OTP_EXPIRED"
            : "OTP_INVALID",
        check.reason === "locked"
          ? "Trop d'essais : ce code est bloqué. Demande un nouveau code."
          : check.reason === "expired"
            ? "Ce code a expiré (10 minutes). Demande un nouveau code."
            : `Code incorrect. Il te reste ${String(check.attemptsLeft)} essai${check.attemptsLeft > 1 ? "s" : ""}.`,
      );
    }
    challengeId = challenge.id;
    verifiedEmail = challenge.email;
  } else {
    if (loaded.row.linkId === null)
      throw new DomainError("SIGNATURE_STATE", "Mode sur place introuvable.");
    if (!input.verification.confirmed) {
      throw new DomainError(
        "SIGNATURE_INVALID",
        "Coche « J'ai vérifié l'identité de la personne » pour signer sans code.",
      );
    }
    method = "IN_PERSON";
    verifiedById = input.verification.actor.userId;
  }

  // 2. The signature itself: a real trace (stored) or the exact full name.
  let imageKey: string | null = null;
  let typedName: string | null = null;
  if (input.signature.kind === "drawn") {
    checkSignaturePng(input.signature.png);
    imageKey = newStorageKey("png", "signatures");
    try {
      await storage.put(imageKey, Buffer.from(input.signature.png), "image/png");
    } catch (error) {
      throw new DomainError(
        "STORAGE_UNAVAILABLE",
        "La signature ne peut pas être enregistrée pour le moment (stockage indisponible). Réessaie plus tard, ou signe en saisissant ton nom.",
        { cause: error },
      );
    }
  } else {
    typedName = checkTypedSignature(input.signature.name, who.fullName);
  }

  // 3. The proof row, and the state of the dossier.
  const actor: AuditActor =
    input.verification.kind === "in-person"
      ? {
          userId: input.verification.actor.userId,
          label: `${input.verification.actor.name} (sur place)`,
        }
      : SIGNING_ACTOR;
  try {
    await withAudit(db, actor, async (tx, audit) => {
      const signature = await tx.signature.create({
        data: {
          submissionId: input.submissionId,
          signerRole: input.role,
          signerName: who.fullName,
          signerQuality: who.quality,
          imageKey,
          typedName,
          method,
          verifiedEmail,
          verifiedById,
          signedAt: now,
          otpChallengeId: challengeId,
          userAgent: input.userAgent?.slice(0, 400) ?? null,
          ipHash: ipHash(input.ip),
        },
      });
      audit.created("Signature", signature.id, signature);
      if (challengeId) {
        await tx.otpChallenge.update({ where: { id: challengeId }, data: { verifiedAt: now } });
      }
      const signedRoles = new Set([...loaded.row.signatures.map((s) => s.signerRole), input.role]);
      if (state.required.every((r) => signedRoles.has(r))) {
        const updated = await tx.dossierSubmission.updateMany({
          where: { id: input.submissionId, status: "SUBMITTED" },
          data: { status: "SIGNED", signedAt: now },
        });
        if (updated.count === 0)
          throw new DomainError("SIGNATURE_STATE", "Ce dossier a changé d'état.");
        audit.log({
          action: "UPDATE",
          entity: "DossierSubmission",
          entityId: input.submissionId,
          field: "status",
          oldValue: "SUBMITTED",
          newValue: "SIGNED",
        });
        if (loaded.row.linkId) {
          await tx.dossierLink.update({ where: { id: loaded.row.linkId }, data: { usedAt: now } });
          audit.log({
            action: "UPDATE",
            entity: "DossierLink",
            entityId: loaded.row.linkId,
            field: "usedAt",
            newValue: now,
          });
        }
      }
    });
  } catch (error) {
    if (imageKey) await storage.delete(imageKey).catch(() => undefined);
    // Unique (dossier, role): someone signed for this role in the meantime.
    if (
      error instanceof Error &&
      /signatures_submission_id_signer_role_key|Unique constraint/.test(error.message)
    ) {
      throw new DomainError("SIGNATURE_STATE", "Cette signature a déjà été enregistrée.", {
        cause: error,
      });
    }
    throw error;
  }
  return stateOf(await loadSubmission(db, input.submissionId), now);
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

async function imagesOf(
  storage: StorageService,
  signatures: Loaded["row"]["signatures"],
  extra: Partial<Record<SignerRole, SignatureImage>> = {},
): Promise<Partial<Record<SignerRole, SignatureImage>>> {
  const images: Partial<Record<SignerRole, SignatureImage>> = { ...extra };
  for (const s of signatures) {
    if (s.typedName) images[s.signerRole] = { typedName: s.typedName, signedAt: s.signedAt };
    else if (s.imageKey) {
      try {
        images[s.signerRole] = {
          png: new Uint8Array(await storage.get(s.imageKey)),
          signedAt: s.signedAt,
        };
      } catch (error) {
        throw new DomainError(
          "STORAGE_UNAVAILABLE",
          "Une signature n'a pas pu être relue dans le stockage : génération impossible pour le moment.",
          { cause: error },
        );
      }
    }
  }
  return images;
}

/**
 * A document as it will be signed, generated on the fly (never stored),
 * marked « Aperçu », without signatures.
 */
export async function previewDocument(
  db: DbOrTx,
  submissionId: string,
  key: TemplateKey,
  now = new Date(),
): Promise<{ bytes: Uint8Array; fileName: string; disposition: string }> {
  const loaded = await loadSubmission(db, submissionId);
  const settings = await dossierSettings(db);
  const id = loaded.data.identity ?? {};
  const bytes = await renderTemplate({
    template: await loadTemplate(key),
    font: await loadFont(),
    mapping: MAPPINGS[key]({
      data: loaded.data,
      ulName: settings.ulName,
      ulCity: settings.ulCity,
      signedAt: null,
      crf: null,
      minor: loaded.minor,
    }),
    images: {},
    title: `${TEMPLATES[key].label} (aperçu)`,
    producedAt: now,
    preview: true,
  });
  const fileName = `Aperçu_${documentFileName(id.lastName ?? "", id.firstName ?? "", TEMPLATES[key].suffix)}`;
  return { bytes, fileName, disposition: contentDisposition(fileName, "inline") };
}

interface Generated {
  key: TemplateKey | "proof";
  kind: "DOSSIER" | "CHARTE" | "APTITUDE" | "OTHER";
  fileName: string;
  bytes: Uint8Array;
  sha256: string;
}

const KIND: Record<TemplateKey, Generated["kind"]> = {
  dossier: "DOSSIER",
  charte: "CHARTE",
  aptitude: "APTITUDE",
};

function splitName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

// ---------------------------------------------------------------------------
// Countersignature
// ---------------------------------------------------------------------------

export function defaultQuality(actor: Actor): string {
  const order = ["TOPAZE", "DIAMANT", "ACTION", "LASER", "FORMAT", "FORMAT_GP"] as const;
  const profile = order.find((p) => actor.profiles.has(p));
  return profile ? PROFILE_LABELS[profile] : "Responsable de l'unité locale";
}

export interface CountersignResult {
  mailSent: boolean;
  mailError: string | null;
  documents: { fileName: string; sha256: string }[];
}

/**
 * Countersignature of the charte by a responsible (`dossier.manage`; her
 * session stands as verification), then, in order and resumed cleanly on a
 * failure: generation; storage; proof, documents, COMPLETE and GAIA in one
 * transaction; e-mail to the volunteer (and the guardian). Storage down:
 * nothing is marked signed. E-mail down: the documents are kept, « Renvoyer
 * l'e-mail » sends them again.
 */
export async function countersign(
  db: Db,
  storage: StorageService,
  mail: MailService,
  actor: Actor,
  input: { submissionId: string; signature: SignatureInput; quality: string },
  now = new Date(),
): Promise<CountersignResult> {
  // 0. Claim: a second responsible is refused (state check).
  const claim = await db.dossierSubmission.updateMany({
    where: {
      id: input.submissionId,
      status: "SIGNED",
      OR: [
        { countersignStartedAt: null },
        { countersignStartedAt: { lt: new Date(now.getTime() - CLAIM_MS) } },
      ],
    },
    data: { countersignStartedAt: now },
  });
  if (claim.count === 0) {
    const current = await db.dossierSubmission.findUnique({
      where: { id: input.submissionId },
      select: { status: true },
    });
    throw new DomainError(
      "SIGNATURE_STATE",
      current?.status === "COMPLETE"
        ? "Ce dossier est déjà contresigné."
        : current?.status === "SIGNED"
          ? "Une contresignature est déjà en cours pour ce dossier."
          : "Le dossier n'est pas prêt à être contresigné : toutes les signatures ne sont pas réunies.",
    );
  }
  const stored: string[] = [];
  const release = async () => {
    await db.dossierSubmission
      .updateMany({
        where: { id: input.submissionId, status: "SIGNED" },
        data: { countersignStartedAt: null },
      })
      .catch(() => undefined);
    for (const key of stored) await storage.delete(key).catch(() => undefined);
  };

  let generated: Generated[];
  let crfImageKey: string | null = null;
  let crfTypedName: string | null = null;
  const crfName = actor.name;
  const quality = input.quality.trim().slice(0, 80) || defaultQuality(actor);
  let loaded: Loaded;
  try {
    loaded = await loadSubmission(db, input.submissionId);
    const settings = await dossierSettings(db);
    const id = loaded.data.identity ?? {};
    let crfImage: SignatureImage;
    if (input.signature.kind === "drawn") {
      checkSignaturePng(input.signature.png);
      crfImage = { png: input.signature.png, signedAt: now };
    } else {
      crfTypedName = checkTypedSignature(input.signature.name, crfName);
      crfImage = { typedName: crfTypedName, signedAt: now };
    }

    // 1. Generation.
    const images = await imagesOf(storage, loaded.row.signatures, { CRF_REPRESENTATIVE: crfImage });
    const volunteerSignedAt =
      loaded.row.signatures.find((s) => s.signerRole === "VOLUNTEER")?.signedAt ?? now;
    const font = await loadFont();
    const handwriting = await loadHandwriting();
    const crf = { ...splitName(crfName), quality };
    generated = [];
    for (const key of TEMPLATE_KEYS) {
      const bytes = await renderTemplate({
        template: await loadTemplate(key),
        font,
        handwriting,
        mapping: MAPPINGS[key]({
          data: loaded.data,
          ulName: settings.ulName,
          ulCity: settings.ulCity,
          signedAt: volunteerSignedAt,
          crf,
          minor: loaded.minor,
        }),
        images,
        title: TEMPLATES[key].label,
        producedAt: now,
      });
      generated.push({
        key,
        kind: KIND[key],
        fileName: documentFileName(id.lastName ?? "", id.firstName ?? "", TEMPLATES[key].suffix),
        bytes,
        sha256: sha256(bytes),
      });
    }
    const signers: ProofSigner[] = [
      ...loaded.row.signatures.map((s) => ({
        role: s.signerRole,
        name: s.signerName,
        quality: s.signerQuality,
        method: s.method,
        verifiedEmail: s.verifiedEmail,
        verifiedBy: s.verifiedById
          ? s.verifiedById === actor.userId
            ? actor.name
            : "un responsable"
          : null,
        signedAt: s.signedAt,
        userAgent: s.userAgent,
        ipHash: s.ipHash,
        typed: s.typedName !== null,
      })),
      {
        role: "CRF_REPRESENTATIVE",
        name: crfName,
        quality,
        method: "SESSION",
        verifiedEmail: actor.email,
        verifiedBy: null,
        signedAt: now,
        userAgent: null,
        ipHash: null,
        typed: crfTypedName !== null,
      },
    ];
    const proof = await renderProof({
      font,
      person: {
        ref: loaded.row.person.ref,
        fullName: `${id.firstName ?? ""} ${id.lastName ?? ""}`.trim(),
      },
      ulName: settings.ulName,
      signers,
      documents: generated.map((g) => ({ fileName: g.fileName, sha256: g.sha256 })),
      producedAt: now,
    });
    generated.push({
      key: "proof",
      kind: "OTHER",
      fileName: documentFileName(id.lastName ?? "", id.firstName ?? "", "Preuve-de-signature"),
      bytes: proof,
      sha256: sha256(proof),
    });

    // 2. Storage (UL copy).
    try {
      if (input.signature.kind === "drawn") {
        crfImageKey = newStorageKey("png", "signatures");
        await storage.put(crfImageKey, Buffer.from(input.signature.png), "image/png");
        stored.push(crfImageKey);
      }
      for (const g of generated) {
        const key = newStorageKey("pdf", "documents");
        await storage.put(key, Buffer.from(g.bytes), "application/pdf");
        stored.push(key);
        (g as Generated & { storageKey?: string }).storageKey = key;
      }
    } catch (error) {
      throw new DomainError(
        "STORAGE_UNAVAILABLE",
        "Le stockage des documents est indisponible : rien n'a été signé côté unité locale. Réessayez quand le stockage sera configuré ou de nouveau joignable.",
        { cause: error },
      );
    }
  } catch (error) {
    await release();
    throw error;
  }

  // 3. Proof, documents, COMPLETE and GAIA, in one transaction.
  const hashes = Object.fromEntries(
    generated.filter((g) => g.key !== "proof").map((g) => [g.fileName, g.sha256]),
  );
  try {
    await withAudit(db, { userId: actor.userId, label: actor.name }, async (tx, audit) => {
      const fresh = await tx.dossierSubmission.updateMany({
        where: { id: input.submissionId, status: "SIGNED", countersignStartedAt: now },
        data: { status: "COMPLETE", completedAt: now, countersignStartedAt: null },
      });
      if (fresh.count === 0)
        throw new DomainError("SIGNATURE_STATE", "Ce dossier a changé d'état.");
      audit.log({
        action: "UPDATE",
        entity: "DossierSubmission",
        entityId: input.submissionId,
        field: "status",
        oldValue: "SIGNED",
        newValue: "COMPLETE",
      });
      const crfSignature = await tx.signature.create({
        data: {
          submissionId: input.submissionId,
          signerRole: "CRF_REPRESENTATIVE",
          signerName: crfName,
          signerQuality: quality,
          imageKey: crfImageKey,
          typedName: crfTypedName,
          method: "SESSION",
          verifiedEmail: actor.email,
          verifiedById: actor.userId,
          signedAt: now,
          documentHashes: hashes,
        },
      });
      audit.created("Signature", crfSignature.id, crfSignature);
      await tx.signature.updateMany({
        where: { submissionId: input.submissionId },
        data: { documentHashes: hashes },
      });
      for (const g of generated) {
        const previous = await tx.document.findMany({
          where: {
            personId: loaded.row.personId,
            kind: g.kind,
            copy: "UL",
            archivedAt: null,
            ...(g.kind === "OTHER" ? { submissionId: { not: null } } : {}),
          },
          select: { id: true, version: true },
        });
        for (const p of previous) {
          await tx.document.update({
            where: { id: p.id },
            data: { archivedAt: now, updatedById: actor.userId },
          });
          audit.archived("Document", p.id);
        }
        const version = Math.max(0, ...previous.map((p) => p.version)) + 1;
        const document = await tx.document.create({
          data: {
            personId: loaded.row.personId,
            kind: g.kind,
            copy: "UL",
            storageKey: (g as Generated & { storageKey: string }).storageKey,
            fileName: g.fileName,
            mimeType: "application/pdf",
            sizeBytes: g.bytes.length,
            sha256: g.sha256,
            version,
            submissionId: input.submissionId,
            uploadedById: actor.userId,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
        });
        audit.created("Document", document.id, document);
      }
      const candidacy = await tx.candidacy.findFirst({
        where: { personId: loaded.row.personId, closedAt: null },
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
            note: "Dossier signé et contresigné : documents envoyés au bénévole.",
            abandonReason: null,
            nextAction: "Créer le compte Gaia et le NIVOL",
            followUpAt: null,
          },
          toParisDay(now),
        );
      }
    });
  } catch (error) {
    await release();
    throw error;
  }

  // 4. E-mail (after the documents are safe).
  const sent = await sendFinal(db, mail, loaded, generated, now);
  return {
    ...sent,
    documents: generated.map((g) => ({ fileName: g.fileName, sha256: g.sha256 })),
  };
}

async function sendFinal(
  db: Db,
  mail: MailService,
  loaded: Loaded,
  files: { fileName: string; bytes: Uint8Array; key: TemplateKey | "proof" }[],
  now: Date,
): Promise<{ mailSent: boolean; mailError: string | null }> {
  const settings = await dossierSettings(db);
  const volunteer = party(loaded.data, "VOLUNTEER");
  const to = [volunteer.email, ...(loaded.minor ? [party(loaded.data, "PARENT").email] : [])]
    .filter(Boolean)
    .join(", ");
  const attachments = [
    ...files
      .filter((f) => f.key !== "proof")
      .map((f) => ({
        filename: f.fileName,
        content: Buffer.from(f.bytes),
        contentType: "application/pdf",
      })),
    ...(await Promise.all(
      (Object.keys(ENCLOSURES) as (keyof typeof ENCLOSURES)[]).map(async (k) => ({
        filename: ENCLOSURES[k].file,
        content: Buffer.from(await loadEnclosure(k)),
        contentType: "application/pdf",
      })),
    )),
  ];
  const message = finalDocumentsMail({
    template: settings.finalMailText,
    firstName: volunteer.firstName,
    ulName: settings.ulName,
    attachments: attachments.map((a) => a.filename.replace(/\.pdf$/, "")),
  });
  try {
    if (!to) throw new MailUnavailableError();
    await mail.send({ to, ...message, attachments });
    await db.dossierSubmission.update({
      where: { id: loaded.row.id },
      data: { finalMailSentAt: now, finalMailError: null },
    });
    return { mailSent: true, mailError: null };
  } catch (error) {
    const text =
      error instanceof MailUnavailableError
        ? "L'e-mail des documents n'a pas pu partir. Les documents sont rangés : utilisez « Renvoyer l'e-mail »."
        : "L'e-mail des documents a échoué. Les documents sont rangés : utilisez « Renvoyer l'e-mail ».";
    await db.dossierSubmission.update({
      where: { id: loaded.row.id },
      data: { finalMailError: text },
    });
    return { mailSent: false, mailError: text };
  }
}

/** « Renvoyer l'e-mail »: the stored UL copy is sent again (never regenerated). */
export async function resendFinalMail(
  db: Db,
  storage: StorageService,
  mail: MailService,
  actor: Actor,
  submissionId: string,
  now = new Date(),
): Promise<{ mailSent: boolean; mailError: string | null }> {
  const loaded = await loadSubmission(db, submissionId);
  if (loaded.row.status !== "COMPLETE") {
    throw new DomainError("SIGNATURE_STATE", "Le dossier n'est pas encore complet.");
  }
  const documents = await db.document.findMany({
    where: { submissionId, archivedAt: null, kind: { in: ["DOSSIER", "CHARTE", "APTITUDE"] } },
    orderBy: { kind: "asc" },
  });
  const files: { fileName: string; bytes: Uint8Array; key: TemplateKey }[] = [];
  for (const d of documents) {
    try {
      const bytes = new Uint8Array(await storage.get(d.storageKey));
      if (sha256(bytes) !== d.sha256) throw new Error("hash");
      files.push({
        fileName: d.fileName,
        bytes,
        key: d.kind === "DOSSIER" ? "dossier" : d.kind === "CHARTE" ? "charte" : "aptitude",
      });
    } catch (error) {
      throw new DomainError(
        "STORAGE_UNAVAILABLE",
        "Les documents n'ont pas pu être relus dans le stockage : renvoi impossible pour le moment.",
        { cause: error },
      );
    }
  }
  const result = await sendFinal(db, mail, loaded, files, now);
  await withAudit(db, { userId: actor.userId, label: actor.name }, (_tx, audit) => {
    audit.log({
      action: "UPDATE",
      entity: "DossierSubmission",
      entityId: submissionId,
      field: "finalMail",
      newValue: result.mailSent ? "renvoyé" : "échec",
    });
    return Promise.resolve();
  });
  return result;
}

// ---------------------------------------------------------------------------
// Responsible side: state of the dossier (Intégration tab)
// ---------------------------------------------------------------------------

export interface SignatureStatus {
  submissionId: string;
  status: Loaded["row"]["status"];
  minor: boolean;
  volunteerSignedAt: Date | null;
  parentSignedAt: Date | null;
  countersignedAt: Date | null;
  finalMailSentAt: Date | null;
  finalMailError: string | null;
  /** The volunteer, the parent and the countersignature still to come. */
  waitingFor: "VOLUNTEER" | "PARENT" | "COUNTERSIGN" | null;
}

/** State of the signatures of the latest sent dossier of a person (no content). */
export async function signatureStatus(
  db: DbOrTx,
  personId: string,
): Promise<SignatureStatus | null> {
  const row = await db.dossierSubmission.findFirst({
    where: { personId, status: { in: ["SUBMITTED", "SIGNED", "COMPLETE"] } },
    orderBy: { submittedAt: "desc" },
    select: { id: true },
  });
  if (!row) return null;
  const loaded = await loadSubmission(db, row.id);
  const at = (role: SignerRole) =>
    loaded.row.signatures.find((s) => s.signerRole === role)?.signedAt ?? null;
  const state = stateOf(loaded, new Date());
  return {
    submissionId: row.id,
    status: loaded.row.status,
    minor: loaded.minor,
    volunteerSignedAt: at("VOLUNTEER"),
    parentSignedAt: at("PARENT"),
    countersignedAt: at("CRF_REPRESENTATIVE"),
    finalMailSentAt: loaded.row.finalMailSentAt,
    finalMailError: loaded.row.finalMailError,
    waitingFor:
      loaded.row.status === "SUBMITTED"
        ? state.next
        : loaded.row.status === "SIGNED"
          ? "COUNTERSIGN"
          : null,
  };
}
