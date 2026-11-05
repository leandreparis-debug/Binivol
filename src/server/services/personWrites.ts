import type { z } from "zod";
import type {
  archiveListItemSchema,
  identitySchema,
  nivolCorrectionSchema,
  personListItemSchema,
  statusChangeSchema,
} from "@/lib/personForms";
import { withAudit } from "../audit";
import type { Db } from "../db";
import { DomainError, translateDbError } from "../errors";
import type { Actor } from "../policy/types";
import { numericSettings } from "../settings";

/**
 * Write side of the person page. The caller (a `defineAction`) has already
 * validated the input with the schemas of `src/lib/personForms.ts` and
 * authorised the action on the person. Every change goes through
 * `withAudit`, field by field.
 *
 * Concurrency: two responsibles editing the same person → the **last save
 * wins**; the audit keeps both changes (docs/decisions.md, ADR-029).
 */

const auditActor = (actor: Actor) => ({ userId: actor.userId, label: actor.name });

/** Adds whole years to a calendar day (29/02 → 28/02 on a non-leap year). */
export function addYearsUtc(day: Date, years: number): Date {
  const year = day.getUTCFullYear() + years;
  const last = new Date(Date.UTC(year, day.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, day.getUTCMonth(), Math.min(day.getUTCDate(), last)));
}

export type StatusChange = z.output<typeof statusChangeSchema>;

/**
 * Changes the status (TOPAZE):
 * - LEFT: departure date and reason required; `purgeEligibleAt` = departure
 *   + RETENTION_YEARS_AFTER_LEAVE years;
 * - ACTIVE: a valid NIVOL is required, unless the person was imported;
 * - leaving LEFT clears `leftAt`, `leftReason`, `leftComment` and
 *   `purgeEligibleAt`.
 * The audit keeps the history (shown in the timeline).
 */
export async function changePersonStatus(db: Db, actor: Actor, input: StatusChange): Promise<void> {
  const { retentionYears } = await numericSettings(db);
  try {
    await withAudit(db, auditActor(actor), async (tx, audit) => {
      const before = await tx.person.findUniqueOrThrow({ where: { id: input.personId } });
      if (before.status === "CANDIDATE") {
        throw new DomainError(
          "INVALID_DATA",
          "Un candidat change de statut par son intégration (étape 6), pas ici.",
        );
      }
      if (input.status === "ACTIVE" && !before.nivol && !before.legacyImport) {
        throw new DomainError(
          "NIVOL_REQUIRED",
          "Impossible de passer en Actif sans NIVOL : il est attribué par Gaia (assistant à venir).",
        );
      }
      const data =
        input.status === "LEFT"
          ? {
              status: input.status,
              leftAt: input.leftAt,
              leftReason: input.leftReason,
              leftComment: input.leftComment,
              purgeEligibleAt: input.leftAt ? addYearsUtc(input.leftAt, retentionYears) : null,
            }
          : {
              status: input.status,
              leftAt: null,
              leftReason: null,
              leftComment: null,
              purgeEligibleAt: null,
            };
      const after = await tx.person.update({
        where: { id: input.personId },
        data: { ...data, updatedById: actor.userId },
      });
      audit.updated("Person", input.personId, before, after);
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

export type IdentityUpdate = z.output<typeof identitySchema>;

/** Identity and contact (`person.update`). The NIVOL and the CRF e-mail are untouched. */
export async function updatePersonIdentity(
  db: Db,
  actor: Actor,
  input: IdentityUpdate,
): Promise<void> {
  const { personId, ...data } = input;
  try {
    await withAudit(db, auditActor(actor), async (tx, audit) => {
      const before = await tx.person.findUniqueOrThrow({ where: { id: personId } });
      const after = await tx.person.update({
        where: { id: personId },
        data: { ...data, updatedById: actor.userId },
      });
      audit.updated("Person", personId, before, after);
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

export type NivolCorrection = z.output<typeof nivolCorrectionSchema>;

/**
 * Corrects the NIVOL (TOPAZE only, `person.nivol.correct`): normalised by the
 * schema, refused when another person holds it, reason recorded in the audit.
 */
export async function correctPersonNivol(
  db: Db,
  actor: Actor,
  input: NivolCorrection,
): Promise<void> {
  try {
    await withAudit(db, auditActor(actor), async (tx, audit) => {
      const before = await tx.person.findUniqueOrThrow({ where: { id: input.personId } });
      if (before.nivol === input.nivol) {
        throw new DomainError("INVALID_DATA", "Ce NIVOL est déjà celui de la personne.");
      }
      const holder = await tx.person.findUnique({
        where: { nivol: input.nivol },
        select: { id: true, ref: true },
      });
      if (holder) {
        throw new DomainError(
          "NIVOL_TAKEN",
          `Ce NIVOL est déjà attribué à une autre personne (${holder.ref}).`,
        );
      }
      await tx.person.update({
        where: { id: input.personId },
        data: { nivol: input.nivol, updatedById: actor.userId },
      });
      audit.log({
        action: "UPDATE",
        entity: "Person",
        entityId: input.personId,
        field: "nivol",
        oldValue: before.nivol,
        newValue: { value: input.nivol, reason: input.reason },
      });
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

export type ListItem = z.output<typeof personListItemSchema>;

const ENTITY = {
  annex: "PersonAnnex",
  skill: "PersonSkill",
  language: "PersonLanguage",
  license: "PersonLicense",
} as const;

function notFound(): never {
  throw new DomainError("INVALID_DATA", "Élément introuvable sur cette fiche.");
}

/** Adds or edits an annex competence, a skill, a language or a driving licence. */
export async function savePersonListItem(db: Db, actor: Actor, input: ListItem): Promise<void> {
  const who = { createdById: actor.userId, updatedById: actor.userId };
  try {
    await withAudit(db, auditActor(actor), async (tx, audit) => {
      const { personId } = input;
      const entity = ENTITY[input.list];
      switch (input.list) {
        case "annex": {
          const data = { code: input.code, label: input.label, validUntil: input.validUntil };
          if (!input.id) {
            const row = await tx.personAnnex.create({ data: { personId, ...data, ...who } });
            audit.created(entity, row.id, row);
            return;
          }
          const before = await tx.personAnnex.findFirst({
            where: { id: input.id, personId, archivedAt: null },
          });
          if (!before) notFound();
          const after = await tx.personAnnex.update({
            where: { id: input.id },
            data: { ...data, updatedById: actor.userId },
          });
          audit.updated(entity, input.id, before, after);
          return;
        }
        case "skill":
        case "language": {
          const data = { label: input.label, level: input.level };
          if (!input.id) {
            const row =
              input.list === "skill"
                ? await tx.personSkill.create({
                    data: { personId, label: input.label, level: input.level, ...who },
                  })
                : await tx.personLanguage.create({
                    data: { personId, label: input.label, level: input.level, ...who },
                  });
            audit.created(entity, row.id, row);
            return;
          }
          const before =
            input.list === "skill"
              ? await tx.personSkill.findFirst({
                  where: { id: input.id, personId, archivedAt: null },
                })
              : await tx.personLanguage.findFirst({
                  where: { id: input.id, personId, archivedAt: null },
                });
          if (!before) notFound();
          const after =
            input.list === "skill"
              ? await tx.personSkill.update({
                  where: { id: input.id },
                  data: { label: data.label, level: input.level, updatedById: actor.userId },
                })
              : await tx.personLanguage.update({
                  where: { id: input.id },
                  data: { label: data.label, level: input.level, updatedById: actor.userId },
                });
          audit.updated(entity, input.id, before, after);
          return;
        }
        case "license": {
          // One row per category: re-adding an archived category brings it back.
          const existing = await tx.personLicense.findUnique({
            where: { personId_category: { personId, category: input.category } },
          });
          if (existing && existing.id !== input.id && existing.archivedAt === null) {
            throw new DomainError("INVALID_DATA", `Le permis ${input.category} est déjà indiqué.`);
          }
          if (existing && existing.archivedAt !== null) {
            const after = await tx.personLicense.update({
              where: { id: existing.id },
              data: { archivedAt: null, updatedById: actor.userId },
            });
            audit.updated(entity, existing.id, existing, after);
            if (input.id && input.id !== existing.id) await archiveLicense(input.id);
            return;
          }
          if (!input.id) {
            const row = await tx.personLicense.create({
              data: { personId, category: input.category, ...who },
            });
            audit.created(entity, row.id, row);
            return;
          }
          const before = await tx.personLicense.findFirst({
            where: { id: input.id, personId, archivedAt: null },
          });
          if (!before) notFound();
          const after = await tx.personLicense.update({
            where: { id: input.id },
            data: { category: input.category, updatedById: actor.userId },
          });
          audit.updated(entity, input.id, before, after);
          return;
        }
      }

      async function archiveLicense(id: string) {
        const row = await tx.personLicense.findFirst({ where: { id, personId, archivedAt: null } });
        if (!row) return;
        await tx.personLicense.update({ where: { id }, data: { archivedAt: new Date() } });
        audit.archived(entity, id);
      }
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

export type ArchiveListItem = z.output<typeof archiveListItemSchema>;

/** Archives an item of the person's lists (never a physical deletion). */
export async function archivePersonListItem(
  db: Db,
  actor: Actor,
  input: ArchiveListItem,
): Promise<void> {
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const where = { id: input.id, personId: input.personId, archivedAt: null };
    const data = { archivedAt: new Date(), updatedById: actor.userId };
    const count =
      input.list === "annex"
        ? (await tx.personAnnex.updateMany({ where, data })).count
        : input.list === "skill"
          ? (await tx.personSkill.updateMany({ where, data })).count
          : input.list === "language"
            ? (await tx.personLanguage.updateMany({ where, data })).count
            : (await tx.personLicense.updateMany({ where, data })).count;
    if (count === 0) notFound();
    audit.archived(ENTITY[input.list], input.id);
  });
}
