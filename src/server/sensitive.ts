import { Prisma } from "@/generated/prisma/client";
import { adultBornOnOrBefore, ageOn } from "@/lib/age";
import { withAudit } from "./audit";
import type { DbOrTx } from "./db";
import { inTransaction } from "./db";
import { DomainError } from "./errors";
import type { DocumentCopy, DocumentKind } from "@/generated/prisma/enums";
import { authorize, can, ForbiddenError } from "./policy/can";
import { loadPersonFacts } from "./policy/facts";
import type { Actor, PersonFacts } from "./policy/types";

/**
 * **The only path to sensitive data** (birth, address, people to notify, B3,
 * parental authorisation, documents). Each read is authorised by the policy
 * and journaled in `access_logs` in the same transaction as the read. A
 * refusal reads nothing and writes nothing.
 *
 * An architecture test fails if `personSensitive`, `emergencyContact` or
 * `document` are queried anywhere else in `src/` (tests excepted).
 */

export interface SensitiveView {
  personId: string;
  birthDate: Date | null;
  birthCity: string | null;
  birthDepartment: string | null;
  birthCountry: string | null;
  street: string | null;
  addressComplement: string | null;
  postalCode: string | null;
  city: string | null;
  country: string | null;
  b3CheckedAt: Date | null;
  b3Status: string | null;
  /** Null when unknown (empty legacy cell). */
  parentalAuthorization: boolean | null;
  parentalAuthorizationDate: Date | null;
  emergencyContacts: {
    id: string;
    position: number;
    civility: string | null;
    lastName: string;
    firstName: string | null;
    relationship: string | null;
    street: string | null;
    postalCode: string | null;
    city: string | null;
    country: string | null;
    phone1: string | null;
    phone2: string | null;
    email: string | null;
  }[];
}

async function personFactsOrThrow(db: DbOrTx, personId: string) {
  const facts = await loadPersonFacts(db, personId);
  if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  return facts;
}

/**
 * Reads the sensitive data of a person for `actor`, and journals the
 * consultation (`SENSITIVE_VIEW`, `context` = page or action).
 *
 * @throws {ForbiddenError} when `person.sensitive.read` is refused.
 */
export async function readPersonSensitive(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  context: string,
): Promise<SensitiveView> {
  authorize(actor, "person.sensitive.read", { person: await personFactsOrThrow(db, personId) });
  return inTransaction(db, async (tx) => {
    const [sensitive, contacts] = await Promise.all([
      tx.personSensitive.findUnique({ where: { personId } }),
      tx.emergencyContact.findMany({ where: { personId }, orderBy: { position: "asc" } }),
    ]);
    await tx.accessLog.create({
      data: { userId: actor.userId, personId, scope: "SENSITIVE_VIEW", context },
    });
    return {
      personId,
      birthDate: sensitive?.birthDate ?? null,
      birthCity: sensitive?.birthCity ?? null,
      birthDepartment: sensitive?.birthDepartment ?? null,
      birthCountry: sensitive?.birthCountry ?? null,
      street: sensitive?.street ?? null,
      addressComplement: sensitive?.addressComplement ?? null,
      postalCode: sensitive?.postalCode ?? null,
      city: sensitive?.city ?? null,
      country: sensitive?.country ?? null,
      b3CheckedAt: sensitive?.b3CheckedAt ?? null,
      b3Status: sensitive?.b3Status ?? null,
      parentalAuthorization: sensitive?.parentalAuthorization ?? null,
      parentalAuthorizationDate: sensitive?.parentalAuthorizationDate ?? null,
      emergencyContacts: contacts.map((c) => ({
        id: c.id,
        position: c.position,
        civility: c.civility,
        lastName: c.lastName,
        firstName: c.firstName,
        relationship: c.relationship,
        street: c.street,
        postalCode: c.postalCode,
        city: c.city,
        country: c.country,
        phone1: c.phone1,
        phone2: c.phone2,
        email: c.email,
      })),
    };
  });
}

export interface DocumentView {
  id: string;
  personId: string;
  kind: string;
  copy: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  fileMissing: boolean;
}

/**
 * Reads the metadata of a document (the bytes come later from
 * StorageService) and journals the consultation (`DOCUMENT_VIEW`).
 *
 * @throws {ForbiddenError} when `document.read` is refused.
 */
export async function readDocument(
  db: DbOrTx,
  actor: Actor,
  documentId: string,
  context: string,
): Promise<DocumentView> {
  const owner = await db.document.findUnique({
    where: { id: documentId },
    select: { personId: true, archivedAt: true },
  });
  if (!owner) throw new DomainError("INVALID_DATA", "Document introuvable.");
  const person = await personFactsOrThrow(db, owner.personId);
  authorize(actor, "document.read", { person });
  // An archived document stays readable by TOPAZE only.
  if (owner.archivedAt) authorize(actor, "document.archived.read", { person });
  return inTransaction(db, async (tx) => {
    const doc = await tx.document.findUniqueOrThrow({ where: { id: documentId } });
    await tx.accessLog.create({
      data: { userId: actor.userId, personId: doc.personId, scope: "DOCUMENT_VIEW", context },
    });
    return {
      id: doc.id,
      personId: doc.personId,
      kind: doc.kind,
      copy: doc.copy,
      storageKey: doc.storageKey,
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      sizeBytes: doc.sizeBytes,
      sha256: doc.sha256,
      fileMissing: doc.fileMissing,
    };
  });
}

export { ForbiddenError };

/** Owner of a document (resource of the archive action), or null. */
export async function documentOwner(db: DbOrTx, documentId: string): Promise<string | null> {
  const row = await db.document.findUnique({
    where: { id: documentId },
    select: { personId: true },
  });
  return row?.personId ?? null;
}

export interface NewDocumentRow {
  personId: string;
  kind: DocumentKind;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  expiresAt: Date | null;
}

/**
 * Inserts the row of an uploaded document (after the file is stored), audited
 * with masked file name, key and hash. The caller authorised `document.upload`.
 */
export async function insertDocumentRow(
  db: DbOrTx,
  actor: Actor,
  data: NewDocumentRow,
): Promise<string> {
  return withAudit(db, { userId: actor.userId, label: actor.name }, async (tx, audit) => {
    const row = await tx.document.create({
      data: {
        ...data,
        copy: "UL",
        uploadedById: actor.userId,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });
    audit.created("Document", row.id, row);
    return row.id;
  });
}

/**
 * Archives a document (never deleted: the file stays in the storage). The
 * caller authorised `document.upload` on its owner.
 */
export async function archiveDocumentRow(
  db: DbOrTx,
  actor: Actor,
  documentId: string,
): Promise<void> {
  await withAudit(db, { userId: actor.userId, label: actor.name }, async (tx, audit) => {
    const { count } = await tx.document.updateMany({
      where: { id: documentId, archivedAt: null },
      data: { archivedAt: new Date(), updatedById: actor.userId },
    });
    if (count === 0) throw new DomainError("INVALID_DATA", "Document introuvable ou déjà archivé.");
    audit.archived("Document", documentId);
  });
}

/** A document of the « Documents » tab (metadata only, no storage key). */
export interface DocumentListItem {
  id: string;
  kind: DocumentKind;
  copy: DocumentCopy;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileMissing: boolean;
  expiresAt: Date | null;
  archivedAt: Date | null;
  createdAt: Date;
  uploadedBy: string | null;
}

/**
 * Documents of a person (`document.read`). Archived documents are included
 * only for `document.archived.read` (TOPAZE). Listing metadata is not a
 * consultation: the access log is written when a file is opened
 * (`readDocument`, route `GET /api/documents/[id]`).
 */
export async function listPersonDocuments(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts?: PersonFacts,
): Promise<DocumentListItem[]> {
  const person = facts ?? (await personFactsOrThrow(db, personId));
  authorize(actor, "document.read", { person });
  const withArchived = can(actor, "document.archived.read", { person }).allowed;
  const rows = await db.document.findMany({
    where: { personId, ...(withArchived ? {} : { archivedAt: null }) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      kind: true,
      copy: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      fileMissing: true,
      expiresAt: true,
      archivedAt: true,
      createdAt: true,
      uploadedBy: { select: { name: true } },
    },
  });
  return rows.map(({ uploadedBy, ...row }) => ({ ...row, uploadedBy: uploadedBy?.name ?? null }));
}

// ---------------------------------------------------------------------------
// Age (step 5). The directory and the person page show the age and a « Mineur »
// pill, and filter minors: they need the birth date, which is sensitive. Only
// the **derived** age leaves this module — never the birth date itself — so
// these reads are not journaled (no birth date is shown). The full sensitive
// block stays behind `readPersonSensitive`, which is journaled.
// ---------------------------------------------------------------------------

/** Age of each person on `day` (null when the birth date is unknown). Missing ids → null. */
export async function agesOf(
  db: DbOrTx,
  personIds: readonly string[],
  day: Date,
): Promise<Map<string, number | null>> {
  const result = new Map<string, number | null>(personIds.map((id) => [id, null]));
  if (personIds.length === 0) return result;
  const rows = await db.personSensitive.findMany({
    where: { personId: { in: [...personIds] }, birthDate: { not: null } },
    select: { personId: true, birthDate: true },
  });
  for (const row of rows) result.set(row.personId, ageOn(row.birthDate, day));
  return result;
}

/**
 * SQL condition on `persons p`: the person is a minor on `day` (known birth
 * date, less than 18 years old). For the directory's « Mineur » filter.
 */
export function minorSql(day: Date): Prisma.Sql {
  return Prisma.sql`EXISTS (
    SELECT 1 FROM person_sensitive s
    WHERE s.person_id = p.id AND s.birth_date > ${adultBornOnOrBefore(day)}::date
  )`;
}

// ---------------------------------------------------------------------------
// Import of the legacy workbook (step 4). The import is authorised by
// `import.run` (TOPAZE) before it starts; it compares and writes sensitive
// values here, so this module stays the only one touching these tables. Every
// change is audited with masked values (no access log: no one views them).
// ---------------------------------------------------------------------------

/** Sensitive fields carried by the workbook (Benevoles and Prospects). */
// A type alias (not an interface) so it is assignable to Record<string, unknown>.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ImportedSensitive = {
  birthDate: Date | null;
  b3CheckedAt?: Date | null;
  parentalAuthorization?: boolean | null;
  parentalAuthorizationDate?: Date | null;
};

/** Current sensitive values of people, for the import's comparison. */
export async function loadSensitiveForImport(
  tx: DbOrTx,
  personIds: string[],
): Promise<Map<string, ImportedSensitive & { id: string }>> {
  if (personIds.length === 0) return new Map();
  const rows = await tx.personSensitive.findMany({
    where: { personId: { in: personIds } },
    select: {
      id: true,
      personId: true,
      birthDate: true,
      b3CheckedAt: true,
      parentalAuthorization: true,
      parentalAuthorizationDate: true,
    },
  });
  return new Map(rows.map(({ personId, ...rest }) => [personId, rest]));
}

/**
 * Creates or updates the sensitive values of a person from the import, and
 * records IMPORT audit entries with masked values. Returns the row id.
 */
export async function writeSensitiveForImport(
  tx: DbOrTx,
  audit: { created: AuditCreated; updated: AuditUpdated },
  actorUserId: string | null,
  personId: string,
  data: ImportedSensitive,
  existing: (ImportedSensitive & { id: string }) | undefined,
): Promise<string> {
  if (!existing) {
    const created = await tx.personSensitive.create({
      data: { personId, ...data, createdById: actorUserId, updatedById: actorUserId },
    });
    audit.created("PersonSensitive", created.id, created, { action: "IMPORT" });
    return created.id;
  }
  const updated = await tx.personSensitive.update({
    where: { id: existing.id },
    data: { ...data, updatedById: actorUserId },
  });
  audit.updated("PersonSensitive", existing.id, { ...existing }, { ...data }, { action: "IMPORT" });
  return updated.id;
}

type AuditCreated = (
  entity: string,
  entityId: string,
  row: Record<string, unknown>,
  options?: { action?: "IMPORT" },
) => void;
type AuditUpdated = (
  entity: string,
  entityId: string,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  options?: { action?: "IMPORT" },
) => number;
