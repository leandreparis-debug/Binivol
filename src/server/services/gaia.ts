import type { Prisma } from "@/generated/prisma/client";
import type { CandidacyStage } from "@/generated/prisma/enums";
import {
  canUndoFinalize,
  gaiaRows,
  parseCheckedStates,
  parseGaiaChecklist,
  type CheckedState,
  type GaiaRow,
} from "@/lib/gaia";
import { withAudit } from "../audit";
import type { Db, DbOrTx } from "../db";
import {
  attestationState,
  revertNivolAttestation,
  type AttestationState,
} from "../dossier/signing";
import { DomainError } from "../errors";
import { authorize, can } from "../policy/can";
import type { Actor, PersonFacts } from "../policy/types";
import { hasDocumentOfKind, readPersonSensitive } from "../sensitive";
import { STALE_MESSAGE } from "./candidacies";

/**
 * Gaia assistant (step 9, docs/integration.md). Binivol never calls Gaia: it
 * lays out the values to type in Gaia's creation screen, keeps a dated
 * checklist, then the closure (`finalizeCandidacy`) records the NIVOL and the
 * CRF e-mail. TOPAZE may undo a closure made by mistake within 7 days.
 */

const auditActor = (actor: Actor) => ({ userId: actor.userId, label: actor.name });

export async function gaiaChecklistSetting(db: DbOrTx) {
  const row = await db.setting.findUnique({ where: { key: "GAIA_CHECKLIST" } });
  return parseGaiaChecklist(row?.value);
}

export interface GaiaChecklistView {
  key: string;
  label: string;
  checked: CheckedState | null;
}

export interface GaiaBlockView {
  candidacyId: string;
  stage: CandidacyStage;
  closedAt: Date | null;
  checklist: GaiaChecklistView[];
  /** TOPAZE, within 7 days of the closure. */
  canUndo: boolean;
  /** The aptitude certificate still waiting for the NIVOL (« Compléter l'attestation »). */
  attestation: AttestationState;
}

/**
 * The « Gaia » block of the Intégration tab (`candidacy.manage`): the open
 * candidacy at « Création Gaia », or a closure of the last 7 days (undo,
 * certificate). No sensitive value: the sheet is read on demand.
 */
export async function gaiaBlock(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
  now: Date = new Date(),
): Promise<GaiaBlockView | null> {
  authorize(actor, "candidacy.manage", { person: facts });
  const open = await db.candidacy.findFirst({
    where: { personId, closedAt: null, stage: "GAIA" },
  });
  const recent =
    open ??
    (await db.candidacy.findFirst({
      where: {
        personId,
        stage: "DONE",
        closedAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
      },
      orderBy: { closedAt: "desc" },
    }));
  if (!recent) return null;
  const items = await gaiaChecklistSetting(db);
  const adhesion = await hasDocumentOfKind(db, personId, "ADHESION");
  const states = parseCheckedStates(recent.gaiaChecklist);
  return {
    candidacyId: recent.id,
    stage: recent.stage,
    closedAt: recent.closedAt,
    checklist: items
      .filter((i) => !i.onlyIfAdhesion || adhesion || states[i.key])
      .map((i) => ({ key: i.key, label: i.label, checked: states[i.key] ?? null })),
    canUndo:
      recent.stage === "DONE" &&
      can(actor, "candidacy.finalize.undo", { person: facts }).allowed &&
      canUndoFinalize(recent.closedAt, now),
    attestation: recent.stage === "DONE" ? await attestationState(db, personId) : "none",
  };
}

/**
 * The prefilled sheet, read on demand: the sensitive values come through
 * `readPersonSensitive` (journaled, context « gaia »), never in the first
 * render of the page.
 */
export async function readGaiaSheet(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
): Promise<GaiaRow[]> {
  authorize(actor, "candidacy.manage", { person: facts });
  const [person, sensitive] = await Promise.all([
    db.person.findUniqueOrThrow({
      where: { id: personId },
      select: {
        civility: true,
        lastName: true,
        birthName: true,
        usageName: true,
        firstName: true,
        phone: true,
        email: true,
      },
    }),
    readPersonSensitive(db, actor, personId, "gaia"),
  ]);
  const contact = sensitive.emergencyContacts[0];
  return gaiaRows({
    civility: person.civility,
    lastName: person.lastName,
    birthName: person.birthName,
    usageName: person.usageName,
    firstName: person.firstName,
    phone: person.phone,
    email: person.email,
    birthDate: sensitive.birthDate,
    birthCity: sensitive.birthCity,
    birthDepartment: sensitive.birthDepartment,
    birthCountry: sensitive.birthCountry,
    street: sensitive.street,
    addressComplement: sensitive.addressComplement,
    postalCode: sensitive.postalCode,
    city: sensitive.city,
    country: sensitive.country,
    emergency: contact
      ? {
          firstName: contact.firstName,
          lastName: contact.lastName,
          relationship: contact.relationship,
          phone: contact.phone1,
        }
      : null,
  });
}

/** Checks or unchecks an item of the checklist (who, when), while at « Création Gaia ». */
export async function setGaiaChecklistItem(
  db: Db,
  actor: Actor,
  input: { personId: string; candidacyId: string; key: string; checked: boolean },
  now: Date = new Date(),
): Promise<void> {
  const items = await gaiaChecklistSetting(db);
  if (!items.some((i) => i.key === input.key)) {
    throw new DomainError("INVALID_DATA", "Élément de la liste inconnu.");
  }
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const before = await tx.candidacy.findUniqueOrThrow({ where: { id: input.candidacyId } });
    if (before.personId !== input.personId) {
      throw new DomainError("INVALID_DATA", "Candidature introuvable.");
    }
    if (before.stage !== "GAIA" || before.closedAt) {
      throw new DomainError("STALE_CANDIDACY", STALE_MESSAGE);
    }
    const states = Object.fromEntries(
      Object.entries(parseCheckedStates(before.gaiaChecklist)).filter(([k]) => k !== input.key),
    );
    if (input.checked) {
      states[input.key] = { at: now.toISOString(), byId: actor.userId, by: actor.name };
    }
    const after = await tx.candidacy.update({
      where: { id: before.id },
      data: {
        gaiaChecklist: states as unknown as Prisma.InputJsonObject,
        updatedById: actor.userId,
      },
    });
    audit.updated("Candidacy", before.id, before, after);
  });
}

/**
 * Undo of a closure made by mistake (TOPAZE, `candidacy.finalize.undo`,
 * within 7 days, reason required), in one transaction: NIVOL and CRF e-mail
 * removed from the page, status CANDIDATE, candidacy reopened at « Création
 * Gaia » with its event, the 3-month follow-up cancelled, the certificate
 * generated with the NIVOL archived. Everything is audited.
 */
export async function undoFinalize(
  db: Db,
  actor: Actor,
  facts: PersonFacts,
  input: { candidacyId: string; reason: string },
  now: Date = new Date(),
): Promise<void> {
  authorize(actor, "candidacy.finalize.undo", { person: facts });
  const reason = input.reason.trim();
  if (reason.length < 3) throw new DomainError("INVALID_DATA", "Le motif est obligatoire.");
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const candidacy = await tx.candidacy.findUniqueOrThrow({ where: { id: input.candidacyId } });
    if (candidacy.personId !== facts.personId) {
      throw new DomainError("INVALID_DATA", "Candidature introuvable.");
    }
    if (candidacy.stage !== "DONE" || !candidacy.closedAt) {
      throw new DomainError("STALE_CANDIDACY", STALE_MESSAGE);
    }
    if (!canUndoFinalize(candidacy.closedAt, now)) {
      throw new DomainError(
        "TRANSITION_REFUSED",
        "La clôture date de plus de 7 jours : elle ne peut plus être annulée ici.",
      );
    }
    const open = await tx.candidacy.count({
      where: { personId: candidacy.personId, closedAt: null },
    });
    if (open > 0) {
      throw new DomainError(
        "CANDIDACY_ALREADY_OPEN",
        "Cette personne a déjà une candidature en cours.",
      );
    }
    // Concurrency: only one undo applies.
    const { count } = await tx.candidacy.updateMany({
      where: { id: candidacy.id, stage: "DONE" },
      data: {
        stage: "GAIA",
        closedAt: null,
        nextAction: "Vérifier la création Gaia (clôture annulée)",
        updatedById: actor.userId,
      },
    });
    if (count === 0) throw new DomainError("STALE_CANDIDACY", STALE_MESSAGE);
    const reopened = await tx.candidacy.findUniqueOrThrow({ where: { id: candidacy.id } });
    audit.updated("Candidacy", candidacy.id, candidacy, reopened);
    await tx.candidacyEvent.create({
      data: {
        candidacyId: candidacy.id,
        authorId: actor.userId,
        fromStage: "DONE",
        toStage: "GAIA",
        note: `Clôture annulée : ${reason}`,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });

    const before = await tx.person.findUniqueOrThrow({ where: { id: candidacy.personId } });
    const person = await tx.person.update({
      where: { id: candidacy.personId },
      data: {
        status: "CANDIDATE",
        nivol: null,
        crfEmail: null,
        entryDate: null,
        updatedById: actor.userId,
      },
    });
    audit.updated("Person", person.id, before, person);

    const followUps = await tx.followUp.findMany({
      where: {
        personId: candidacy.personId,
        kind: "THREE_MONTHS",
        doneAt: null,
        cancelledAt: null,
        createdAt: { gte: new Date(candidacy.closedAt.getTime() - 60_000) },
      },
    });
    for (const f of followUps) {
      const cancelled = await tx.followUp.update({
        where: { id: f.id },
        data: {
          cancelledAt: now,
          cancelledById: actor.userId,
          cancelReason: `Clôture annulée : ${reason}`,
          updatedById: actor.userId,
        },
      });
      audit.cancelled("FollowUp", f.id, cancelled.cancelReason);
    }
    await revertNivolAttestation(
      tx,
      audit,
      actor.userId,
      candidacy.personId,
      candidacy.closedAt,
      now,
    );
  });
}
