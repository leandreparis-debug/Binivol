import type { DbOrTx } from "./db";
import { inTransaction } from "./db";
import { DomainError } from "./errors";
import { authorize, ForbiddenError } from "./policy/can";
import { loadPersonFacts } from "./policy/facts";
import type { Actor } from "./policy/types";

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
  parentalAuthorization: boolean;
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
      parentalAuthorization: sensitive?.parentalAuthorization ?? false,
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
    select: { personId: true },
  });
  if (!owner) throw new DomainError("INVALID_DATA", "Document introuvable.");
  authorize(actor, "document.read", { person: await personFactsOrThrow(db, owner.personId) });
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
