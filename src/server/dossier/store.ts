import type { DocumentKind, SubmissionStatus } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import {
  DOSSIER_SCHEMA_VERSION,
  migrateDossierData,
  normalizeSubmission,
  submissionIssues,
  type DossierDraft,
  type DossierIssue,
} from "@/lib/dossierSchema";
import { formatPhone } from "@/lib/phone";
import { withAudit, type Actor as AuditActor } from "../audit";
import type { DbOrTx, Tx } from "../db";
import { checkDocumentFile, cleanFileName, sha256Hex } from "../documentFile";
import { DomainError } from "../errors";
import { authorize, can } from "../policy/can";
import { loadPersonFactsMany } from "../policy/facts";
import type { Actor, PersonFacts } from "../policy/types";
import { newStorageKey, StorageUnavailableError, type StorageService } from "../storage";
import {
  buildComparison,
  EMERGENCY_KEYS,
  LIST_KEYS,
  PERSON_KEYS,
  SENSITIVE_KEYS,
  type ComparisonRow,
  type CurrentValues,
  type ReportKey,
} from "./compare";

/**
 * **The dossier's sensitive store** — with `src/server/sensitive.ts`, the only
 * module allowed to touch `dossier_submissions`, `dossier_attachments`, and
 * the sensitive tables it fills from a dossier (`person_sensitive`,
 * `emergency_contacts`, `documents`). The architecture test enforces it.
 *
 * - The candidate reads and writes **her own draft only**, through the
 *   dossier session (no access log: nobody else consults it).
 * - A responsible reads a submitted dossier through `readDossierForReview`,
 *   which checks `dossier.manage` and writes an access log (SENSITIVE_VIEW,
 *   context « dossier »).
 * - Every write is audited; `data`, file names, keys and hashes are masked.
 */

export const CANDIDATE_ACTOR: AuditActor = { userId: null, label: "Candidat (dossier en ligne)" };

export interface DraftAttachment {
  id: string;
  kind: DocumentKind;
  fileName: string;
  sizeBytes: number;
  createdAt: Date;
}

export interface DraftView {
  submissionId: string;
  status: SubmissionStatus;
  data: DossierDraft;
  warnings: string[];
  updatedAt: Date;
  submittedAt: Date | null;
  attachments: DraftAttachment[];
}

const attachmentSelect = {
  id: true,
  kind: true,
  fileName: true,
  sizeBytes: true,
  createdAt: true,
} as const;

/** The current draft of a person (latest DRAFT), migrated to the current shape, or null. */
export async function loadDraft(db: DbOrTx, personId: string): Promise<DraftView | null> {
  const row = await db.dossierSubmission.findFirst({
    where: { personId, status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
    include: {
      attachments: {
        where: { archivedAt: null },
        orderBy: { createdAt: "asc" },
        select: attachmentSelect,
      },
    },
  });
  if (!row) return null;
  const { data, warnings } = migrateDossierData(row.data, row.schemaVersion);
  return {
    submissionId: row.id,
    status: row.status,
    data,
    warnings,
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
    attachments: row.attachments,
  };
}

/**
 * The draft of the person, created when missing, and attached to `linkId`
 * (a new link takes over the draft typed through the previous one).
 */
export async function ensureDraft(
  tx: Tx,
  personId: string,
  linkId: string,
  prefill: DossierDraft,
  actor: AuditActor,
): Promise<string> {
  // A dossier sent but not signed yet follows the new link too (to sign it).
  const existing = await tx.dossierSubmission.findFirst({
    where: { personId, status: { in: ["DRAFT", "SUBMITTED"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, linkId: true },
  });
  if (existing) {
    if (existing.linkId !== linkId) {
      await tx.dossierSubmission.update({ where: { id: existing.id }, data: { linkId } });
    }
    return existing.id;
  }
  const created = await tx.dossierSubmission.create({
    data: {
      personId,
      linkId,
      status: "DRAFT",
      data: prefill,
      schemaVersion: DOSSIER_SCHEMA_VERSION,
      createdById: actor.userId,
      updatedById: actor.userId,
    },
  });
  return created.id;
}

/** The dossier sent and waiting for its signatures, for a person (null otherwise). */
export async function submissionToSign(
  db: DbOrTx,
  personId: string,
): Promise<{ submissionId: string; linkId: string | null } | null> {
  const row = await db.dossierSubmission.findFirst({
    where: { personId, status: "SUBMITTED" },
    orderBy: { submittedAt: "desc" },
    select: { id: true, linkId: true },
  });
  return row ? { submissionId: row.id, linkId: row.linkId } : null;
}

/** Saves a draft (last write wins, two tabs never crash). Refused once submitted. */
export async function saveDraft(
  db: DbOrTx,
  submissionId: string,
  data: DossierDraft,
  actor: AuditActor = CANDIDATE_ACTOR,
): Promise<Date> {
  return withAudit(db, actor, async (tx, audit) => {
    const before = await tx.dossierSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    if (before.status !== "DRAFT") {
      throw new DomainError("INVALID_DATA", "Ce dossier a déjà été envoyé.");
    }
    const after = await tx.dossierSubmission.update({
      where: { id: submissionId },
      data: { data, schemaVersion: DOSSIER_SCHEMA_VERSION, updatedById: actor.userId },
    });
    audit.updated("DossierSubmission", submissionId, before, after);
    return after.updatedAt;
  });
}

export const ATTACHMENT_KINDS = ["PARENTAL_AUTH", "ADHESION"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

/**
 * Adds a file to a draft: checked by signature and size, stored under a random
 * key, then recorded. Storage down or not configured: clear message, the draft
 * is kept.
 */
export async function addAttachment(
  db: DbOrTx,
  storage: StorageService,
  input: { submissionId: string; kind: AttachmentKind; fileName: string; bytes: Uint8Array },
  actor: AuditActor = CANDIDATE_ACTOR,
): Promise<DraftAttachment> {
  const draft = await db.dossierSubmission.findUnique({
    where: { id: input.submissionId },
    select: { status: true },
  });
  if (draft?.status !== "DRAFT")
    throw new DomainError("INVALID_DATA", "Ce dossier a déjà été envoyé.");
  // Even called without the form: only the kinds still accepted (no diploma copy, ADR-049).
  if (!(ATTACHMENT_KINDS as readonly string[]).includes(input.kind)) {
    throw new DomainError("INVALID_DATA", "Ce type de pièce n'est plus accepté.");
  }
  const type = checkDocumentFile(input.bytes);
  const key = newStorageKey(type.extension, "dossiers");
  const body = Buffer.from(input.bytes);
  try {
    await storage.put(key, body, type.mimeType);
  } catch (error) {
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      error instanceof StorageUnavailableError
        ? "L'envoi des pièces jointes n'est pas disponible pour le moment. Votre dossier est enregistré : vous pourrez ajouter la pièce plus tard."
        : "L'envoi des pièces jointes n'est pas disponible pour le moment. Votre dossier est enregistré.",
      { cause: error },
    );
  }
  try {
    return await withAudit(db, actor, async (tx, audit) => {
      const row = await tx.dossierAttachment.create({
        data: {
          submissionId: input.submissionId,
          kind: input.kind,
          storageKey: key,
          fileName: cleanFileName(input.fileName, type),
          mimeType: type.mimeType,
          sizeBytes: body.length,
          sha256: sha256Hex(body),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      audit.created("DossierAttachment", row.id, row);
      return {
        id: row.id,
        kind: row.kind,
        fileName: row.fileName,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt,
      };
    });
  } catch (error) {
    await storage.delete(key).catch(() => undefined);
    throw error;
  }
}

/** Removes a file from a draft (archived; the stored file stays until the purge). */
export async function removeAttachment(
  db: DbOrTx,
  input: { submissionId: string; attachmentId: string },
  actor: AuditActor = CANDIDATE_ACTOR,
): Promise<void> {
  await withAudit(db, actor, async (tx, audit) => {
    const { count } = await tx.dossierAttachment.updateMany({
      where: {
        id: input.attachmentId,
        submissionId: input.submissionId,
        archivedAt: null,
        submission: { status: "DRAFT" },
      },
      data: { archivedAt: new Date(), updatedById: actor.userId },
    });
    if (count === 0) throw new DomainError("INVALID_DATA", "Pièce introuvable.");
    audit.archived("DossierAttachment", input.attachmentId);
  });
}

export type SubmitOutcome = { ok: true; submittedAt: Date } | { ok: false; issues: DossierIssue[] };

/**
 * Submits a draft: complete rules (minors on the submission day), normalised
 * data stored with its `schemaVersion`, attachments turned into documents of
 * the person, link marked used. All in one transaction; nothing written when
 * the dossier is incomplete.
 */
export async function submitDraft(
  db: DbOrTx,
  input: { submissionId: string; day: Date; structure: string },
  actor: AuditActor = CANDIDATE_ACTOR,
): Promise<SubmitOutcome> {
  return withAudit(db, actor, async (tx, audit) => {
    const before = await tx.dossierSubmission.findUniqueOrThrow({
      where: { id: input.submissionId },
      include: { attachments: { where: { archivedAt: null } } },
    });
    if (before.status !== "DRAFT") {
      throw new DomainError("INVALID_DATA", "Ce dossier a déjà été envoyé.");
    }
    const { data } = migrateDossierData(before.data, before.schemaVersion);
    const issues = submissionIssues(data, {
      day: input.day,
      attachmentKinds: before.attachments.map((a) => a.kind),
    });
    if (issues.length > 0) return { ok: false as const, issues };

    const normalized = { ...normalizeSubmission(data), structure: input.structure };
    const submittedAt = new Date();
    const after = await tx.dossierSubmission.update({
      where: { id: before.id },
      data: {
        status: "SUBMITTED",
        data: normalized,
        schemaVersion: DOSSIER_SCHEMA_VERSION,
        submittedAt,
        updatedById: actor.userId,
      },
    });
    const { attachments, ...beforeRow } = before;
    audit.updated("DossierSubmission", before.id, beforeRow, after);
    for (const attachment of attachments) {
      const document = await tx.document.create({
        data: {
          personId: before.personId,
          kind: attachment.kind,
          copy: "UL",
          storageKey: attachment.storageKey,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          sha256: attachment.sha256,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      audit.created("Document", document.id, document);
      await tx.dossierAttachment.update({
        where: { id: attachment.id },
        data: { documentId: document.id },
      });
    }
    // The link stays open, for the signature screens only: it is marked used
    // once every required signer has signed (signing.ts, ADR-044).
    return { ok: true as const, submittedAt };
  });
}

export interface DossierStatus {
  state: "none" | "draft" | "submitted";
  updatedAt: Date | null;
  submittedAt: Date | null;
  submissionId: string | null;
}

/** State of the person's dossier, without its content (Intégration tab). */
export async function dossierStatus(db: DbOrTx, personId: string): Promise<DossierStatus> {
  const row = await db.dossierSubmission.findFirst({
    where: { personId, status: { in: ["DRAFT", "SUBMITTED", "SIGNED", "COMPLETE"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, status: true, updatedAt: true, submittedAt: true },
  });
  if (!row) return { state: "none", updatedAt: null, submittedAt: null, submissionId: null };
  return {
    state: row.status === "DRAFT" ? "draft" : "submitted",
    updatedAt: row.updatedAt,
    submittedAt: row.submittedAt,
    submissionId: row.id,
  };
}

// ---------------------------------------------------------------------------
// Review and report (responsible side)
// ---------------------------------------------------------------------------

export interface DossierReview {
  submissionId: string;
  submittedAt: Date | null;
  rows: ComparisonRow[];
  attachments: { kind: DocumentKind; fileName: string; documentId: string | null }[];
}

const dayText = (d: Date | null) => (d ? formatDate(d) : null);

async function currentValues(db: DbOrTx, personId: string): Promise<CurrentValues> {
  const [person, sensitive, contact, skills, languages, licenses, diplomas, activities] =
    await Promise.all([
      db.person.findUniqueOrThrow({ where: { id: personId } }),
      db.personSensitive.findUnique({ where: { personId } }),
      db.emergencyContact.findFirst({ where: { personId }, orderBy: { position: "asc" } }),
      db.personSkill.findMany({ where: { personId, archivedAt: null }, select: { label: true } }),
      db.personLanguage.findMany({
        where: { personId, archivedAt: null },
        select: { label: true },
      }),
      db.personLicense.findMany({
        where: { personId, archivedAt: null },
        select: { category: true },
      }),
      db.personDeclaredDiploma.findMany({ where: { personId }, select: { label: true } }),
      db.personWishedActivity.findMany({ where: { personId }, select: { label: true } }),
    ]);
  const civ = (c: string | null | undefined) => (c === "MME" ? "Mme" : c === "M" ? "M." : null);
  const phone = (p: string | null | undefined) => (p ? formatPhone(p) : null);
  return {
    person: {
      civility: civ(person.civility),
      lastName: person.lastName,
      birthName: person.birthName,
      usageName: person.usageName,
      firstName: person.firstName,
      email: person.email,
      phone: phone(person.phone),
      proEmail: person.proEmail,
      proPhone: phone(person.proPhone),
      profession: person.profession,
      sector: person.sector,
      company: person.company,
    },
    sensitive: {
      birthDate: dayText(sensitive?.birthDate ?? null),
      birthCity: sensitive?.birthCity ?? null,
      birthDepartment: sensitive?.birthDepartment ?? null,
      birthCountry: sensitive?.birthCountry ?? null,
      street: sensitive?.street ?? null,
      addressComplement: sensitive?.addressComplement ?? null,
      postalCode: sensitive?.postalCode ?? null,
      city: sensitive?.city ?? null,
      country: sensitive?.country ?? null,
    },
    emergency: {
      "emergency.civility": civ(contact?.civility),
      "emergency.lastName": contact?.lastName ?? null,
      "emergency.firstName": contact?.firstName ?? null,
      "emergency.relationship": contact?.relationship ?? null,
      "emergency.street": contact?.street ?? null,
      "emergency.postalCode": contact?.postalCode ?? null,
      "emergency.city": contact?.city ?? null,
      "emergency.country": contact?.country ?? null,
      "emergency.phone1": phone(contact?.phone1),
      "emergency.phone2": phone(contact?.phone2),
      "emergency.email": contact?.email ?? null,
    },
    lists: {
      skills: skills.map((s) => s.label),
      languages: languages.map((l) => l.label),
      licenses: licenses.map((l) => l.category),
      diplomas: diplomas.map((d) => d.label),
      activities: activities.map((a) => a.label),
    },
  };
}

/** The latest submitted dossier of a person (SUBMITTED or SIGNED), migrated, or null. */
async function latestSubmitted(db: DbOrTx, personId: string) {
  const row = await db.dossierSubmission.findFirst({
    where: { personId, status: { in: ["SUBMITTED", "SIGNED", "COMPLETE"] } },
    orderBy: { submittedAt: "desc" },
    include: { attachments: { where: { archivedAt: null } } },
  });
  if (!row) return null;
  return { row, data: migrateDossierData(row.data, row.schemaVersion).data };
}

/**
 * The review of the submitted dossier (`dossier.manage`): the comparison table
 * with the person's page. Journaled (SENSITIVE_VIEW, context « dossier »).
 *
 * @throws {ForbiddenError}
 */
export async function readDossierForReview(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
): Promise<DossierReview | null> {
  authorize(actor, "dossier.manage", { person: facts });
  const found = await latestSubmitted(db, personId);
  if (!found) return null;
  const current = await currentValues(db, personId);
  const declared = found.data.crf?.nivol;
  let nivolHolder: string | null = null;
  if (declared) {
    const holder = await db.person.findUnique({
      where: { nivol: declared },
      select: { id: true, ref: true, firstName: true, lastName: true },
    });
    if (holder && holder.id !== personId) {
      const [holderFacts] = [...(await loadPersonFactsMany(db, [holder.id])).values()];
      nivolHolder =
        holderFacts && can(actor, "person.directory.read", { person: holderFacts }).allowed
          ? `${holder.firstName} ${holder.lastName} (${holder.ref})`
          : "une autre fiche";
    }
  }
  await db.accessLog.create({
    data: { userId: actor.userId, personId, scope: "SENSITIVE_VIEW", context: "dossier" },
  });
  return {
    submissionId: found.row.id,
    submittedAt: found.row.submittedAt,
    rows: buildComparison(found.data, current, { nivolHolder }),
    attachments: found.row.attachments.map((a) => ({
      kind: a.kind,
      fileName: a.fileName,
      documentId: a.documentId,
    })),
  };
}

function isoToDay(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y = 0, m = 1, d = 1] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Writes the chosen fields of the submitted dossier into the person's page,
 * in **one audited transaction**: identity and contact (`persons`), birth and
 * address (`person_sensitive`), the first person to notify, and the lists
 * (new items added, nothing removed). The declared NIVOL and CRF e-mail are
 * never written (step 9). The caller authorised `dossier.manage`.
 */
export async function applyDossier(
  db: DbOrTx,
  actor: Actor,
  input: { personId: string; submissionId: string; keys: readonly ReportKey[] },
): Promise<number> {
  const keys = new Set(input.keys);
  return withAudit(db, { userId: actor.userId, label: actor.name }, async (tx, audit) => {
    const submission = await tx.dossierSubmission.findFirst({
      where: {
        id: input.submissionId,
        personId: input.personId,
        status: { in: ["SUBMITTED", "SIGNED", "COMPLETE"] },
      },
    });
    if (!submission)
      throw new DomainError("INVALID_DATA", "Dossier introuvable ou pas encore envoyé.");
    const data = migrateDossierData(submission.data, submission.schemaVersion).data;
    const id = data.identity ?? {};
    const c = data.contact ?? {};
    const e = data.emergency ?? {};
    const p = data.profile ?? {};
    let written = 0;

    // persons
    const personValues: Record<string, unknown> = {
      civility: id.civility ?? null,
      lastName: id.lastName,
      birthName: id.birthName ?? null,
      usageName: id.usageName ?? null,
      firstName: id.firstName,
      email: c.email ?? null,
      phone: c.phone ?? null,
      proEmail: c.proEmail ?? null,
      proPhone: c.proPhone ?? null,
      profession: p.profession ?? null,
      sector: p.sector ?? null,
      company: p.company ?? null,
    };
    const personData = Object.fromEntries(
      PERSON_KEYS.filter(
        (k) => keys.has(k) && personValues[k] !== undefined && personValues[k] !== null,
      ).map((k) => [k, personValues[k]]),
    );
    if (Object.keys(personData).length > 0) {
      const before = await tx.person.findUniqueOrThrow({ where: { id: input.personId } });
      const after = await tx.person.update({
        where: { id: input.personId },
        data: { ...personData, updatedById: actor.userId },
      });
      written += audit.updated("Person", input.personId, before, after);
    }

    // person_sensitive
    const sensitiveValues: Record<string, unknown> = {
      birthDate: isoToDay(id.birthDate),
      birthCity: id.birthCity ?? null,
      birthDepartment: id.birthDepartment ?? null,
      birthCountry: id.birthCountry ?? null,
      street: c.street ?? null,
      addressComplement: c.addressComplement ?? null,
      postalCode: c.postalCode ?? null,
      city: c.city ?? null,
      country: c.country ?? null,
    };
    const sensitiveData = Object.fromEntries(
      SENSITIVE_KEYS.filter((k) => keys.has(k) && sensitiveValues[k] !== null).map((k) => [
        k,
        sensitiveValues[k],
      ]),
    );
    if (Object.keys(sensitiveData).length > 0) {
      const before = await tx.personSensitive.findUnique({ where: { personId: input.personId } });
      if (before) {
        const after = await tx.personSensitive.update({
          where: { id: before.id },
          data: { ...sensitiveData, updatedById: actor.userId },
        });
        written += audit.updated("PersonSensitive", before.id, before, after);
      } else {
        const created = await tx.personSensitive.create({
          data: {
            personId: input.personId,
            ...sensitiveData,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
        });
        audit.created("PersonSensitive", created.id, created);
        written += Object.keys(sensitiveData).length;
      }
    }

    // emergency_contacts (the first one)
    const emergencyValues: Record<string, unknown> = {
      civility: e.civility ?? null,
      lastName: e.lastName,
      firstName: e.firstName ?? null,
      relationship: e.relationship ?? null,
      street: e.address ?? null,
      postalCode: e.postalCode ?? null,
      city: e.city ?? null,
      country: e.country ?? null,
      phone1: e.phone1 ?? null,
      phone2: e.phone2 ?? null,
      email: e.email ?? null,
    };
    const emergencyData = Object.fromEntries(
      EMERGENCY_KEYS.filter((k) => keys.has(k))
        .map((k) => k.slice("emergency.".length))
        .filter((f) => emergencyValues[f] !== undefined && emergencyValues[f] !== null)
        .map((f) => [f, emergencyValues[f]]),
    );
    if (Object.keys(emergencyData).length > 0) {
      const before = await tx.emergencyContact.findFirst({
        where: { personId: input.personId },
        orderBy: { position: "asc" },
      });
      if (before) {
        const after = await tx.emergencyContact.update({
          where: { id: before.id },
          data: { ...emergencyData, updatedById: actor.userId },
        });
        written += audit.updated("EmergencyContact", before.id, before, after);
      } else {
        const created = await tx.emergencyContact.create({
          data: {
            personId: input.personId,
            position: 0,
            lastName: e.lastName ?? "",
            ...emergencyData,
            createdById: actor.userId,
            updatedById: actor.userId,
          },
        });
        audit.created("EmergencyContact", created.id, created);
        written += Object.keys(emergencyData).length;
      }
    }

    // lists: add the dossier's items that the page does not have yet
    const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
    const who = { createdById: actor.userId, updatedById: actor.userId };
    if (keys.has("skills")) {
      const existing = await tx.personSkill.findMany({
        where: { personId: input.personId, archivedAt: null },
      });
      for (const s of p.skills ?? []) {
        if (existing.some((x) => same(x.label, s.label))) continue;
        const row = await tx.personSkill.create({
          data: { personId: input.personId, label: s.label, level: s.level ?? "BEGINNER", ...who },
        });
        audit.created("PersonSkill", row.id, row);
        written += 1;
      }
    }
    if (keys.has("languages")) {
      const existing = await tx.personLanguage.findMany({
        where: { personId: input.personId, archivedAt: null },
      });
      for (const l of p.languages ?? []) {
        if (existing.some((x) => same(x.label, l.label))) continue;
        const row = await tx.personLanguage.create({
          data: { personId: input.personId, label: l.label, level: l.level ?? "NOTIONS", ...who },
        });
        audit.created("PersonLanguage", row.id, row);
        written += 1;
      }
    }
    if (keys.has("licenses")) {
      for (const category of p.licenses ?? []) {
        const existing = await tx.personLicense.findUnique({
          where: { personId_category: { personId: input.personId, category } },
        });
        if (existing?.archivedAt === null) continue;
        if (existing) {
          const after = await tx.personLicense.update({
            where: { id: existing.id },
            data: { archivedAt: null, updatedById: actor.userId },
          });
          audit.updated("PersonLicense", existing.id, existing, after);
        } else {
          const row = await tx.personLicense.create({
            data: { personId: input.personId, category, ...who },
          });
          audit.created("PersonLicense", row.id, row);
        }
        written += 1;
      }
    }
    if (keys.has("diplomas")) {
      const existing = await tx.personDeclaredDiploma.findMany({
        where: { personId: input.personId },
      });
      for (const label of p.diplomas ?? []) {
        if (existing.some((x) => same(x.label, label))) continue;
        const row = await tx.personDeclaredDiploma.create({
          data: { personId: input.personId, label, ...who },
        });
        audit.created("PersonDeclaredDiploma", row.id, row);
        written += 1;
      }
    }
    if (keys.has("activities")) {
      const existing = await tx.personWishedActivity.findMany({
        where: { personId: input.personId },
      });
      for (const label of data.crf?.activities ?? []) {
        if (existing.some((x) => same(x.label, label))) continue;
        const row = await tx.personWishedActivity.create({
          data: { personId: input.personId, label, ...who },
        });
        audit.created("PersonWishedActivity", row.id, row);
        written += 1;
      }
    }
    audit.log({
      action: "UPDATE",
      entity: "DossierSubmission",
      entityId: submission.id,
      field: "reportedToPage",
      newValue: { fields: [...keys].sort() },
    });
    return written;
  });
}

export { LIST_KEYS };

/**
 * Ids, among `personIds`, of the people who signed a dossier (reminder
 * « dossier non signé », step 12). Dates only, nothing of the dossier.
 */
export async function signedDossierPersonIds(
  db: DbOrTx,
  personIds: readonly string[],
): Promise<Set<string>> {
  if (personIds.length === 0) return new Set();
  const rows = await db.dossierSubmission.findMany({
    where: { personId: { in: [...personIds] }, signedAt: { not: null } },
    select: { personId: true },
  });
  return new Set(rows.map((r) => r.personId));
}

/**
 * Number of dossiers signed by the candidate and waiting for the
 * countersignature, among `personIds` (DIAMANT dashboard, step 13).
 */
export async function countDossiersToCountersign(
  db: DbOrTx,
  personIds: readonly string[],
): Promise<number> {
  if (personIds.length === 0) return 0;
  return db.dossierSubmission.count({
    where: { personId: { in: [...personIds] }, status: "SIGNED" },
  });
}

/**
 * GDPR purge (step 14): identifiers of the dossier rows of a person and the
 * storage keys of the files attached to her drafts. Nothing else is read.
 */
export async function dossierFootprint(
  db: DbOrTx,
  personId: string,
): Promise<{ rowIds: string[]; storageKeys: string[] }> {
  const submissions = await db.dossierSubmission.findMany({
    where: { personId },
    select: { id: true },
  });
  const submissionIds = submissions.map((s) => s.id);
  const [attachments, signatures, challenges, links] = await Promise.all([
    db.dossierAttachment.findMany({
      where: { submissionId: { in: submissionIds } },
      select: { id: true, storageKey: true },
    }),
    db.signature.findMany({
      where: { submissionId: { in: submissionIds } },
      select: { id: true, imageKey: true },
    }),
    db.otpChallenge.findMany({
      where: { submissionId: { in: submissionIds } },
      select: { id: true },
    }),
    db.dossierLink.findMany({ where: { personId }, select: { id: true } }),
  ]);
  return {
    rowIds: [
      ...submissionIds,
      ...[...attachments, ...signatures, ...challenges, ...links].map((r) => r.id),
    ],
    storageKeys: [
      ...attachments.map((a) => a.storageKey),
      ...signatures.flatMap((g) => (g.imageKey ? [g.imageKey] : [])),
    ],
  };
}

/**
 * Every dossier of a person, for her GDPR export (step 14, TOPAZE): status,
 * dates and the data she typed. Journaled (`SENSITIVE_VIEW`, « export RGPD »).
 */
export async function dossiersForGdprExport(db: DbOrTx, actor: Actor, personId: string) {
  const facts = (await loadPersonFactsMany(db, [personId])).get(personId);
  if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  authorize(actor, "person.gdprExport", { person: facts });
  const rows = await db.dossierSubmission.findMany({
    where: { personId },
    orderBy: { createdAt: "asc" },
    select: {
      status: true,
      schemaVersion: true,
      submittedAt: true,
      signedAt: true,
      completedAt: true,
      data: true,
      attachments: { select: { kind: true, fileName: true } },
      signatures: { select: { signerRole: true, signerName: true, method: true, signedAt: true } },
    },
  });
  await db.accessLog.create({
    data: { userId: actor.userId, personId, scope: "SENSITIVE_VIEW", context: "export RGPD" },
  });
  return rows;
}
