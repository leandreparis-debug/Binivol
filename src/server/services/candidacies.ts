import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import type {
  AbandonReason,
  CandidacyStage,
  FollowUpKind,
  PersonStatus,
} from "@/generated/prisma/enums";
import type {
  assignMentorSchema,
  candidacyUpdateSchema,
  endMentorshipSchema,
  finalizeSchema,
  newCandidateSchema,
  reengageSchema,
  stageChangeSchema,
} from "@/lib/candidacyForms";
import { toParisDay } from "@/lib/dates";
import { withAudit } from "../audit";
import {
  availableTransitions,
  decideTransition,
  isOpenStage,
  OPEN_STAGES,
  type AllowedTransition,
} from "../candidacy/machine";
import {
  defaultFollowUp,
  DEFAULT_NEXT_ACTIONS,
  followUpState,
  groupSources,
  idleDays,
  rankMentors,
  type FollowUpState,
} from "../candidacy/rules";
import type { Db, DbOrTx, Tx } from "../db";
import { DomainError, translateDbError } from "../errors";
import { parisMidnight, parisWallClock } from "../import/values";
import { authorize, can } from "../policy/can";
import { loadPersonFactsMany } from "../policy/facts";
import type { Actor, PersonFacts } from "../policy/types";
import { visibleSql } from "../policy/visibility";
import { addMonthsUtc } from "../reference";
import { agesOf } from "../sensitive";
import { numericSettings } from "../settings";

/**
 * Candidates and integration (profile DIAMANT, step 6). Every change of
 * stage is checked by the state machine (`../candidacy/machine.ts`), guarded
 * by the stage the screen showed (`expectedStage`, a concurrent change is
 * refused), and written with a `CandidacyEvent` and its audit entries in the
 * same transaction. Lists are filtered in SQL by the policy
 * (`visibleSql(actor, "candidacy.manage")`).
 *
 * Writers assume the action has already been authorised by `defineAction`;
 * readers authorise themselves.
 */

const auditActor = (actor: Actor) => ({ userId: actor.userId, label: actor.name });
export const STALE_MESSAGE = "La candidature a changé entre-temps : rechargez la page.";

// ---------------------------------------------------------------------------
// Owners and sources
// ---------------------------------------------------------------------------

export interface OwnerOption {
  id: string;
  name: string;
}

/** Possible owners: active accounts allowed to create candidates (DIAMANT, TOPAZE). */
export async function ownerOptions(db: DbOrTx): Promise<OwnerOption[]> {
  const users = await db.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, profiles: { select: { profile: true } } },
  });
  return users
    .filter(
      (u) =>
        can({ profiles: new Set(u.profiles.map((p) => p.profile)) }, "candidacy.create").allowed,
    )
    .map((u) => ({ id: u.id, name: u.name }));
}

async function assertOwner(tx: Tx, ownerId: string | null): Promise<void> {
  if (ownerId === null) return;
  if (!(await ownerOptions(tx)).some((o) => o.id === ownerId)) {
    throw new DomainError(
      "INVALID_DATA",
      "Le responsable doit être un compte actif avec le profil DIAMANT ou TOPAZE.",
    );
  }
}

/** Suggestions of the « Source » field, grouped without case nor accents. */
export async function sourceSuggestions(db: DbOrTx): Promise<string[]> {
  const rows = await db.candidacy.findMany({
    where: { source: { not: null } },
    select: { source: true },
  });
  return groupSources(rows.map((r) => r.source));
}

// ---------------------------------------------------------------------------
// Duplicates
// ---------------------------------------------------------------------------

export type DuplicateMatch =
  | {
      visible: true;
      personId: string;
      ref: string;
      firstName: string;
      lastName: string;
      nivol: string | null;
      status: PersonStatus;
      /** What matched: only what the actor typed. */
      matchedOn: ("email" | "phone" | "name")[];
      /** A new candidacy may be opened on this person (left or inactive, none open). */
      canReengage: boolean;
      /** Already a volunteer (active, paused, suspended): no candidacy. */
      alreadyVolunteer: boolean;
      /** Already a candidate with an open candidacy. */
      openCandidacy: boolean;
    }
  | { visible: false; personId: string };

/**
 * People of **every status** with the same e-mail, the same normalised phone,
 * or the same first and last name (without accents nor case). A match the
 * actor cannot see in the directory is reported without any field.
 */
export async function findDuplicates(
  db: DbOrTx,
  actor: Actor,
  input: { firstName: string; lastName: string; email: string | null; phone: string | null },
): Promise<DuplicateMatch[]> {
  const rows = await db.$queryRaw<
    {
      id: string;
      by_email: boolean;
      by_phone: boolean;
      by_name: boolean;
    }[]
  >`
    SELECT p.id,
      (${input.email}::text IS NOT NULL AND lower(p.email) = lower(${input.email}::text)) AS by_email,
      (${input.phone}::text IS NOT NULL AND p.phone = ${input.phone}::text) AS by_phone,
      (binivol_normalize(p.first_name) = binivol_normalize(${input.firstName})
        AND binivol_normalize(p.last_name) = binivol_normalize(${input.lastName})) AS by_name
    FROM persons p
    WHERE (${input.email}::text IS NOT NULL AND lower(p.email) = lower(${input.email}::text))
       OR (${input.phone}::text IS NOT NULL AND p.phone = ${input.phone}::text)
       OR (binivol_normalize(p.first_name) = binivol_normalize(${input.firstName})
           AND binivol_normalize(p.last_name) = binivol_normalize(${input.lastName}))
    ORDER BY p.ref
    LIMIT 20`;
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [facts, people, open] = await Promise.all([
    loadPersonFactsMany(db, ids),
    db.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, ref: true, firstName: true, lastName: true, nivol: true, status: true },
    }),
    db.candidacy.findMany({
      where: { personId: { in: ids }, closedAt: null },
      select: { personId: true },
    }),
  ]);
  const byId = new Map(people.map((p) => [p.id, p]));
  const withOpen = new Set(open.map((o) => o.personId));
  return rows.map((row): DuplicateMatch => {
    const person = byId.get(row.id);
    const f = facts.get(row.id);
    if (!person || !f || !can(actor, "person.directory.read", { person: f }).allowed) {
      return { visible: false, personId: row.id };
    }
    const matchedOn = [
      ...(row.by_email ? (["email"] as const) : []),
      ...(row.by_phone ? (["phone"] as const) : []),
      ...(row.by_name ? (["name"] as const) : []),
    ];
    const openCandidacy = withOpen.has(row.id);
    return {
      visible: true,
      personId: person.id,
      ref: person.ref,
      firstName: person.firstName,
      lastName: person.lastName,
      nivol: person.nivol,
      status: person.status,
      matchedOn,
      canReengage: (person.status === "LEFT" || person.status === "INACTIVE") && !openCandidacy,
      alreadyVolunteer: ["ACTIVE", "PAUSED", "SUSPENDED"].includes(person.status),
      openCandidacy,
    };
  });
}

// ---------------------------------------------------------------------------
// Creation and re-engagement
// ---------------------------------------------------------------------------

export type NewCandidate = z.output<typeof newCandidateSchema>;

export type CreateOutcome =
  | { status: "created"; personId: string; ref: string; candidacyId: string }
  | { status: "duplicates"; matches: DuplicateMatch[] };

/**
 * Creates a candidate (person CANDIDATE, candidacy FIRST_CONTACT, first
 * event). When people match, nothing is written and the matches are returned,
 * unless the actor confirmed « Créer quand même » for exactly these people:
 * that choice is recorded in the audit.
 */
export async function createCandidate(
  db: Db,
  actor: Actor,
  input: NewCandidate,
  day: Date = toParisDay(),
): Promise<CreateOutcome> {
  const matches = await findDuplicates(db, actor, input);
  const confirmed = new Set(input.confirmDuplicates ?? []);
  if (matches.length > 0 && !matches.every((m) => confirmed.has(m.personId))) {
    return { status: "duplicates", matches };
  }
  const { candidacyFollowUpDays } = await numericSettings(db);
  const sources = await sourceSuggestions(db);
  const firstContactDay = input.firstContactAt ?? day;
  try {
    return await withAudit(db, auditActor(actor), async (tx, audit) => {
      const person = await tx.person.create({
        data: {
          firstName: input.firstName,
          lastName: input.lastName,
          email: input.email,
          phone: input.phone,
          status: "CANDIDATE",
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      audit.created("Person", person.id, person);
      if (matches.length > 0) {
        audit.log({
          action: "CREATE",
          entity: "Person",
          entityId: person.id,
          field: "duplicateOverride",
          newValue: { createdDespite: matches.map((m) => m.personId) },
        });
      }
      const candidacyId = await openCandidacy(tx, audit, actor, {
        personId: person.id,
        source: canonical(input.source, sources),
        interest: input.interest,
        firstContactAt: parisMidnight(firstContactDay),
        followUpAt: defaultFollowUp(day, candidacyFollowUpDays),
        note: input.note,
      });
      return { status: "created" as const, personId: person.id, ref: person.ref, candidacyId };
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

function canonical(value: string | null, sources: string[]): string | null {
  if (!value) return null;
  const key = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  return sources.find((s) => key(s) === key(value)) ?? value;
}

async function openCandidacy(
  tx: Tx,
  audit: Parameters<Parameters<typeof withAudit>[2]>[1],
  actor: Actor,
  data: {
    personId: string;
    source: string | null;
    interest: string | null;
    firstContactAt: Date;
    followUpAt: Date;
    note: string | null;
  },
): Promise<string> {
  const candidacy = await tx.candidacy.create({
    data: {
      personId: data.personId,
      stage: "FIRST_CONTACT",
      source: data.source,
      interest: data.interest,
      firstContactAt: data.firstContactAt,
      nextAction: DEFAULT_NEXT_ACTIONS.FIRST_CONTACT ?? null,
      followUpAt: data.followUpAt,
      ownerId: actor.userId,
      notes: data.note,
      createdById: actor.userId,
      updatedById: actor.userId,
    },
  });
  audit.created("Candidacy", candidacy.id, candidacy);
  await tx.candidacyEvent.create({
    data: {
      candidacyId: candidacy.id,
      authorId: actor.userId,
      fromStage: null,
      toStage: "FIRST_CONTACT",
      note: data.note,
      createdById: actor.userId,
      updatedById: actor.userId,
    },
  });
  return candidacy.id;
}

export type Reengage = z.output<typeof reengageSchema>;

/**
 * Re-engages a person who left or is inactive: a new candidacy at
 * FIRST_CONTACT on her existing page. Her status changes only at the
 * finalisation. The caller authorised `candidacy.create`; the person must be
 * visible to the actor in the directory.
 */
export async function reengagePerson(
  db: Db,
  actor: Actor,
  input: Reengage,
  day: Date = toParisDay(),
): Promise<{ candidacyId: string; ref: string }> {
  const [facts] = [...(await loadPersonFactsMany(db, [input.personId], day)).values()];
  if (!facts || !can(actor, "person.directory.read", { person: facts }).allowed) {
    throw new DomainError("INVALID_DATA", "Personne introuvable.");
  }
  const { candidacyFollowUpDays } = await numericSettings(db);
  const sources = await sourceSuggestions(db);
  try {
    return await withAudit(db, auditActor(actor), async (tx, audit) => {
      const person = await tx.person.findUniqueOrThrow({ where: { id: input.personId } });
      if (person.status !== "LEFT" && person.status !== "INACTIVE") {
        throw new DomainError(
          "INVALID_DATA",
          "Seule une personne partie ou inactive peut être réengagée.",
        );
      }
      const candidacyId = await openCandidacy(tx, audit, actor, {
        personId: person.id,
        source: canonical(input.source, sources),
        interest: input.interest,
        firstContactAt: parisMidnight(day),
        followUpAt: defaultFollowUp(day, candidacyFollowUpDays),
        note: input.note ?? "Réengagement d'une personne déjà connue.",
      });
      audit.log({
        action: "CREATE",
        entity: "Candidacy",
        entityId: candidacyId,
        field: "reengagement",
        newValue: { previousStatus: person.status },
      });
      return { candidacyId, ref: person.ref };
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

// ---------------------------------------------------------------------------
// Changes of stage
// ---------------------------------------------------------------------------

/** Stage at which a candidacy was last abandoned (resume target), from its events. */
async function abandonedFrom(db: DbOrTx, candidacyId: string): Promise<CandidacyStage | null> {
  const event = await db.candidacyEvent.findFirst({
    where: { candidacyId, toStage: "ABANDONED" },
    orderBy: { at: "desc" },
    select: { fromStage: true },
  });
  return event?.fromStage ?? null;
}

export type StageChange = z.output<typeof stageChangeSchema>;

/**
 * Moves a candidacy (advance, back, abandon, resume). Refused when the
 * machine refuses, when a required field is missing, or when the stage is no
 * longer `expectedStage` (another responsible changed it). DONE goes through
 * `finalizeCandidacy`.
 */
export async function changeStage(
  db: DbOrTx,
  actor: Actor,
  input: StageChange,
  day: Date = toParisDay(),
): Promise<void> {
  const { candidacyFollowUpDays } = await numericSettings(db);
  try {
    await withAudit(db, auditActor(actor), async (tx, audit) => {
      const before = await tx.candidacy.findUniqueOrThrow({ where: { id: input.candidacyId } });
      if (before.stage !== input.expectedStage)
        throw new DomainError("STALE_CANDIDACY", STALE_MESSAGE);
      const decision = decideTransition(before.stage, input.toStage, {
        abandonedFrom: before.stage === "ABANDONED" ? await abandonedFrom(tx, before.id) : null,
      });
      if (!decision.allowed) throw new DomainError("TRANSITION_REFUSED", decision.reason);
      if (decision.kind === "finalize") {
        throw new DomainError("TRANSITION_REFUSED", "L'intégration se fait par la finalisation.");
      }
      if (decision.requires.includes("note") && !input.note) {
        throw new DomainError(
          "TRANSITION_REFUSED",
          "Une note est obligatoire pour revenir en arrière.",
        );
      }
      if (decision.requires.includes("abandonReason") && !input.abandonReason) {
        throw new DomainError("TRANSITION_REFUSED", "Le motif d'abandon est obligatoire.");
      }
      const reopening = decision.kind === "resume";
      const abandoning = decision.kind === "abandon";
      const data: Prisma.CandidacyUncheckedUpdateManyInput = {
        stage: input.toStage,
        updatedById: actor.userId,
        ...(abandoning
          ? {
              closedAt: new Date(),
              abandonReason: input.abandonReason,
              abandonNote: input.note,
              nextAction: null,
              followUpAt: null,
            }
          : {
              nextAction: input.nextAction ?? DEFAULT_NEXT_ACTIONS[input.toStage] ?? null,
              followUpAt: input.followUpAt ?? defaultFollowUp(day, candidacyFollowUpDays),
            }),
        ...(reopening ? { closedAt: null, abandonReason: null, abandonNote: null } : {}),
      };
      // Atomic guard: the row is updated only if its stage is still the expected one.
      const { count } = await tx.candidacy.updateMany({
        where: { id: before.id, stage: input.expectedStage },
        data,
      });
      if (count === 0) throw new DomainError("STALE_CANDIDACY", STALE_MESSAGE);
      const after = await tx.candidacy.findUniqueOrThrow({ where: { id: before.id } });
      audit.updated("Candidacy", before.id, before, after);
      await tx.candidacyEvent.create({
        data: {
          candidacyId: before.id,
          authorId: actor.userId,
          fromStage: before.stage,
          toStage: input.toStage,
          note: input.note,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

export type CandidacyUpdate = z.output<typeof candidacyUpdateSchema>;

/** Next action, follow-up, meeting, owner, source, interest, notes of an open candidacy. */
export async function updateCandidacy(db: Db, actor: Actor, input: CandidacyUpdate): Promise<void> {
  const sources = await sourceSuggestions(db);
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const before = await tx.candidacy.findUniqueOrThrow({ where: { id: input.candidacyId } });
    if (before.closedAt) throw new DomainError("INVALID_DATA", "Cette candidature est close.");
    await assertOwner(tx, input.ownerId);
    const meetingAt = input.meetingAt ? localToInstant(input.meetingAt) : null;
    const after = await tx.candidacy.update({
      where: { id: before.id },
      data: {
        nextAction: input.nextAction,
        followUpAt: input.followUpAt,
        meetingAt,
        ownerId: input.ownerId,
        source: canonical(input.source, sources),
        interest: input.interest,
        notes: input.notes,
        updatedById: actor.userId,
      },
    });
    audit.updated("Candidacy", before.id, before, after);
  });
}

/** `AAAA-MM-JJTHH:MM`, Paris wall clock → instant. */
function localToInstant(value: string): Date {
  const [date = "", time = ""] = value.split("T");
  const [y = 0, m = 1, d = 1] = date.split("-").map(Number);
  const [h = 0, mi = 0] = time.split(":").map(Number);
  return parisWallClock(y, m, d, h, mi);
}

// ---------------------------------------------------------------------------
// Finalisation
// ---------------------------------------------------------------------------

export type Finalize = z.output<typeof finalizeSchema> & { expectedStage?: CandidacyStage };

export interface FinalizeOptions {
  /** Test hook: runs inside the transaction just before commit (to provoke a failure). */
  beforeCommit?: (tx: Tx) => Promise<void>;
}

/**
 * GAIA → DONE, in **one transaction**: the person becomes ACTIVE with her
 * NIVOL, CRF e-mail and entry date (departure fields cleared for a returning
 * person), the candidacy is closed, a 3-month follow-up is planned at entry
 * date + 3 months, with the event and the audit. Any failure writes nothing.
 */
export async function finalizeCandidacy(
  db: Db,
  actor: Actor,
  input: Finalize,
  options: FinalizeOptions = {},
): Promise<{ personId: string; ref: string; followUpId: string }> {
  try {
    return await withAudit(db, auditActor(actor), async (tx, audit) => {
      const candidacy = await tx.candidacy.findUniqueOrThrow({ where: { id: input.candidacyId } });
      if (candidacy.stage !== (input.expectedStage ?? "GAIA")) {
        throw new DomainError("STALE_CANDIDACY", STALE_MESSAGE);
      }
      const decision = decideTransition(candidacy.stage, "DONE");
      if (!decision.allowed) throw new DomainError("TRANSITION_REFUSED", decision.reason);

      const holder = await tx.person.findUnique({
        where: { nivol: input.nivol },
        select: { id: true, ref: true, firstName: true, lastName: true },
      });
      if (holder && holder.id !== candidacy.personId) {
        const [holderFacts] = [...(await loadPersonFactsMany(tx, [holder.id])).values()];
        const visible =
          holderFacts !== undefined &&
          can(actor, "person.directory.read", { person: holderFacts }).allowed;
        throw new DomainError(
          "NIVOL_TAKEN",
          visible
            ? `Ce NIVOL est déjà attribué à ${holder.firstName} ${holder.lastName} (${holder.ref}).`
            : "Ce NIVOL est déjà attribué à une autre personne.",
        );
      }

      // The CRF e-mail is unique among the people present (step 9).
      if (input.crfEmail) {
        const owner = await tx.person.findFirst({
          where: {
            crfEmail: { equals: input.crfEmail, mode: "insensitive" },
            id: { not: candidacy.personId },
          },
          select: { id: true, ref: true, firstName: true, lastName: true },
        });
        if (owner) {
          const [ownerFacts] = [...(await loadPersonFactsMany(tx, [owner.id])).values()];
          const visible =
            ownerFacts !== undefined &&
            can(actor, "person.directory.read", { person: ownerFacts }).allowed;
          throw new DomainError(
            "EMAIL_TAKEN",
            visible
              ? `Cet e-mail Croix-Rouge est déjà celui de ${owner.firstName} ${owner.lastName} (${owner.ref}).`
              : "Cet e-mail Croix-Rouge est déjà attribué à une autre personne.",
          );
        }
      }

      const before = await tx.person.findUniqueOrThrow({ where: { id: candidacy.personId } });
      const person = await tx.person.update({
        where: { id: candidacy.personId },
        data: {
          status: "ACTIVE",
          nivol: input.nivol,
          ...(input.crfEmail ? { crfEmail: input.crfEmail.toLowerCase() } : {}),
          entryDate: input.entryDate,
          leftAt: null,
          leftReason: null,
          leftComment: null,
          purgeEligibleAt: null,
          updatedById: actor.userId,
        },
      });
      audit.updated("Person", person.id, before, person);

      const { count } = await tx.candidacy.updateMany({
        where: { id: candidacy.id, stage: "GAIA" },
        data: {
          stage: "DONE",
          closedAt: new Date(),
          nextAction: null,
          followUpAt: null,
          updatedById: actor.userId,
        },
      });
      if (count === 0) throw new DomainError("STALE_CANDIDACY", STALE_MESSAGE);
      const closed = await tx.candidacy.findUniqueOrThrow({ where: { id: candidacy.id } });
      audit.updated("Candidacy", candidacy.id, candidacy, closed);
      await tx.candidacyEvent.create({
        data: {
          candidacyId: candidacy.id,
          authorId: actor.userId,
          fromStage: "GAIA",
          toStage: "DONE",
          note: "Intégration finalisée.",
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      const kind: FollowUpKind = "THREE_MONTHS";
      const followUp = await tx.followUp.create({
        data: {
          personId: person.id,
          kind,
          scheduledAt: addMonthsUtc(input.entryDate, 3),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      audit.created("FollowUp", followUp.id, followUp);
      if (options.beforeCommit) await options.beforeCommit(tx);
      return { personId: person.id, ref: person.ref, followUpId: followUp.id };
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

// ---------------------------------------------------------------------------
// Mentorship
// ---------------------------------------------------------------------------

export interface MentorSuggestion {
  id: string;
  ref: string;
  firstName: string;
  lastName: string;
  activeMentees: number;
}

async function activeMenteeCounts(db: DbOrTx, day: Date): Promise<Map<string, number>> {
  const rows = await db.mentorship.groupBy({
    by: ["mentorId"],
    where: { startDate: { lte: day }, OR: [{ endDate: null }, { endDate: { gte: day } }] },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.mentorId, r._count._all]));
}

/**
 * Proposed mentors for `menteeId`: active, adult, not archived, not the
 * mentee, not already her current mentor; fewest current mentees first, then
 * seniority. Directory fields only.
 */
export async function mentorSuggestions(
  db: DbOrTx,
  menteeId: string,
  day: Date = toParisDay(),
  limit = 30,
): Promise<MentorSuggestion[]> {
  const [people, counts, current] = await Promise.all([
    db.person.findMany({
      where: { status: "ACTIVE", archivedAt: null, id: { not: menteeId } },
      select: { id: true, ref: true, firstName: true, lastName: true, entryDate: true },
    }),
    activeMenteeCounts(db, day),
    db.mentorship.findMany({
      where: { menteeId, OR: [{ endDate: null }, { endDate: { gte: day } }] },
      select: { mentorId: true },
    }),
  ]);
  const ages = await agesOf(
    db,
    people.map((p) => p.id),
    day,
  );
  const excluded = new Set(current.map((c) => c.mentorId));
  const eligible = people.filter((p) => {
    const age = ages.get(p.id) ?? null;
    return age !== null && age >= 18 && !excluded.has(p.id);
  });
  return rankMentors(eligible.map((p) => ({ ...p, activeMentees: counts.get(p.id) ?? 0 })))
    .slice(0, limit)
    .map(({ id, ref, firstName, lastName, activeMentees }) => ({
      id,
      ref,
      firstName,
      lastName,
      activeMentees,
    }));
}

export type AssignMentor = z.output<typeof assignMentorSchema>;

/** Starts a mentorship. The caller authorised `mentorship.manage` on the mentee. */
export async function assignMentor(
  db: Db,
  actor: Actor,
  input: AssignMentor,
  day: Date = toParisDay(),
): Promise<string> {
  if (input.mentorId === input.menteeId) {
    throw new DomainError(
      "MENTOR_INVALID",
      "Le parrain doit être une autre personne que le filleul.",
    );
  }
  const mentor = await db.person.findUnique({
    where: { id: input.mentorId },
    select: { id: true, status: true, archivedAt: true },
  });
  if (mentor?.status !== "ACTIVE" || mentor.archivedAt !== null) {
    throw new DomainError("MENTOR_INVALID", "Le parrain doit être un bénévole actif.");
  }
  const age = (await agesOf(db, [mentor.id], day)).get(mentor.id) ?? null;
  if (age === null || age < 18) {
    throw new DomainError(
      "MENTOR_INVALID",
      age === null
        ? "Le parrain doit être majeur : sa date de naissance n'est pas connue."
        : "Le parrain doit être majeur.",
    );
  }
  try {
    return await withAudit(db, auditActor(actor), async (tx, audit) => {
      const existing = await tx.mentorship.count({
        where: {
          menteeId: input.menteeId,
          mentorId: input.mentorId,
          OR: [{ endDate: null }, { endDate: { gte: day } }],
        },
      });
      if (existing > 0) {
        throw new DomainError("MENTOR_INVALID", "Ce parrainage est déjà en cours.");
      }
      const row = await tx.mentorship.create({
        data: {
          menteeId: input.menteeId,
          mentorId: input.mentorId,
          startDate: input.startDate,
          note: input.note,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      audit.created("Mentorship", row.id, row);
      return row.id;
    });
  } catch (error) {
    throw translateDbError(error);
  }
}

export type EndMentorship = z.output<typeof endMentorshipSchema>;

export async function endMentorship(db: Db, actor: Actor, input: EndMentorship): Promise<void> {
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const before = await tx.mentorship.findUniqueOrThrow({ where: { id: input.mentorshipId } });
    if (before.endDate !== null)
      throw new DomainError("INVALID_DATA", "Ce parrainage est déjà terminé.");
    if (input.endDate.getTime() < before.startDate.getTime()) {
      throw new DomainError("INVALID_DATA", "La date de fin précède le début du parrainage.");
    }
    const after = await tx.mentorship.update({
      where: { id: before.id },
      data: {
        endDate: input.endDate,
        note: input.note ? [before.note, input.note].filter(Boolean).join("\n") : before.note,
        updatedById: actor.userId,
      },
    });
    audit.updated("Mentorship", before.id, before, after);
  });
}

/** Mentee of a mentorship (resource of the end action). */
export async function mentorshipMentee(db: DbOrTx, mentorshipId: string): Promise<string | null> {
  const row = await db.mentorship.findUnique({
    where: { id: mentorshipId },
    select: { menteeId: true },
  });
  return row?.menteeId ?? null;
}

/** Person of a candidacy (resource of the candidacy actions). */
export async function candidacyPerson(db: DbOrTx, candidacyId: string): Promise<string | null> {
  const row = await db.candidacy.findUnique({
    where: { id: candidacyId },
    select: { personId: true },
  });
  return row?.personId ?? null;
}

// ---------------------------------------------------------------------------
// Board (/candidats)
// ---------------------------------------------------------------------------

export interface BoardFilters {
  /** `me` (default), `all`, or a user id. */
  owner: string;
  overdueOnly: boolean;
  source: string | null;
  showAbandoned: boolean;
  /** Only the candidates to create in Gaia (stage GAIA, step 9). */
  gaiaOnly?: boolean;
}

export interface CandidateCard {
  candidacyId: string;
  personId: string;
  ref: string;
  legacyRef: string | null;
  firstName: string;
  lastName: string;
  stage: CandidacyStage;
  nextAction: string | null;
  followUpAt: Date | null;
  followUp: FollowUpState;
  owner: string | null;
  idleDays: number;
  source: string | null;
}

export interface CandidacyBoard {
  cards: CandidateCard[];
  stats: {
    byStage: Record<(typeof OPEN_STAGES)[number], number>;
    overdue: number;
    finalizedLast12Months: number;
  };
  owners: OwnerOption[];
  sources: string[];
}

async function visibilityContext(db: DbOrTx, day: Date) {
  return { day, newVolunteerMonths: (await numericSettings(db)).newVolunteerMonths };
}

/**
 * The board of `/candidats`, filtered in SQL by `candidacy.manage`: a profile
 * that may not manage a person's candidacy never gets it, nor counts it.
 */
export async function candidacyBoard(
  db: DbOrTx,
  actor: Actor,
  filters: BoardFilters,
  day: Date = toParisDay(),
): Promise<CandidacyBoard> {
  const ctx = await visibilityContext(db, day);
  const visible = visibleSql(actor, "candidacy.manage", ctx);
  const conditions: Prisma.Sql[] = [visible];
  conditions.push(
    filters.showAbandoned
      ? Prisma.sql`(c.closed_at IS NULL OR c.stage = 'ABANDONED'::"CandidacyStage")`
      : Prisma.sql`c.closed_at IS NULL`,
  );
  if (filters.owner === "me") conditions.push(Prisma.sql`c.owner_id = ${actor.userId}`);
  else if (filters.owner !== "all") conditions.push(Prisma.sql`c.owner_id = ${filters.owner}`);
  if (filters.gaiaOnly) {
    conditions.push(Prisma.sql`c.closed_at IS NULL AND c.stage = 'GAIA'::"CandidacyStage"`);
  }
  if (filters.overdueOnly) {
    conditions.push(Prisma.sql`c.closed_at IS NULL AND c.follow_up_at < ${day}::date`);
  }
  if (filters.source) {
    conditions.push(Prisma.sql`lower(c.source) = lower(${filters.source})`);
  }
  const where = Prisma.join(conditions, " AND ");
  const twelveMonthsAgo = parisMidnight(addMonthsUtc(day, -12));

  const [ids, stageRows, overdueRows, doneRows, owners, sources] = await Promise.all([
    db.$queryRaw<{ id: string }[]>`
      SELECT c.id FROM candidacies c JOIN persons p ON p.id = c.person_id
      WHERE ${where}
      ORDER BY c.follow_up_at ASC NULLS LAST, c.created_at ASC
      LIMIT 500`,
    db.$queryRaw<{ stage: CandidacyStage; n: bigint }[]>`
      SELECT c.stage, count(*) AS n FROM candidacies c JOIN persons p ON p.id = c.person_id
      WHERE ${visible} AND c.closed_at IS NULL GROUP BY c.stage`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM candidacies c JOIN persons p ON p.id = c.person_id
      WHERE ${visible} AND c.closed_at IS NULL AND c.follow_up_at < ${day}::date`,
    db.$queryRaw<{ n: bigint }[]>`
      SELECT count(*) AS n FROM candidacies c JOIN persons p ON p.id = c.person_id
      WHERE ${visible} AND c.stage = 'DONE'::"CandidacyStage" AND c.closed_at >= ${twelveMonthsAgo}`,
    ownerOptions(db),
    sourceSuggestions(db),
  ]);
  const candidacyIds = ids.map((r) => r.id);
  const [rows, lastEvents] = await Promise.all([
    db.candidacy.findMany({
      where: { id: { in: candidacyIds } },
      select: {
        id: true,
        legacyRef: true,
        stage: true,
        nextAction: true,
        followUpAt: true,
        source: true,
        createdAt: true,
        owner: { select: { name: true } },
        person: { select: { id: true, ref: true, firstName: true, lastName: true } },
      },
    }),
    db.candidacyEvent.groupBy({
      by: ["candidacyId"],
      where: { candidacyId: { in: candidacyIds } },
      _max: { at: true },
    }),
  ]);
  const last = new Map(lastEvents.map((e) => [e.candidacyId, e._max.at]));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const byStage = Object.fromEntries(
    OPEN_STAGES.map((s) => [s, 0]),
  ) as CandidacyBoard["stats"]["byStage"];
  for (const row of stageRows) {
    if (isOpenStage(row.stage)) byStage[row.stage] = Number(row.n);
  }
  const cards = candidacyIds.flatMap((id): CandidateCard[] => {
    const row = byId.get(id);
    if (!row) return [];
    const lastAt = last.get(id) ?? row.createdAt;
    return [
      {
        candidacyId: row.id,
        personId: row.person.id,
        ref: row.person.ref,
        legacyRef: row.legacyRef,
        firstName: row.person.firstName,
        lastName: row.person.lastName,
        stage: row.stage,
        nextAction: row.nextAction,
        followUpAt: row.followUpAt,
        followUp: row.stage === "ABANDONED" ? "none" : followUpState(row.followUpAt, day),
        owner: row.owner?.name ?? null,
        idleDays: idleDays(toParisDay(lastAt), day),
        source: row.source,
      },
    ];
  });
  return {
    cards,
    stats: {
      byStage,
      overdue: Number(overdueRows[0]?.n ?? 0),
      finalizedLast12Months: Number(doneRows[0]?.n ?? 0),
    },
    owners,
    sources,
  };
}

/** Overdue follow-ups visible to the actor (badge of the « Candidats » menu entry). */
export async function overdueCandidacies(
  db: DbOrTx,
  actor: Actor,
  day: Date = toParisDay(),
): Promise<number> {
  const visible = visibleSql(actor, "candidacy.manage", await visibilityContext(db, day));
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM candidacies c JOIN persons p ON p.id = c.person_id
    WHERE ${visible} AND c.closed_at IS NULL AND c.follow_up_at < ${day}::date`;
  return Number(rows[0]?.n ?? 0);
}

// ---------------------------------------------------------------------------
// « Intégration » tab of the person page
// ---------------------------------------------------------------------------

export interface CandidacyEventView {
  id: string;
  at: Date;
  author: string | null;
  fromStage: CandidacyStage | null;
  toStage: CandidacyStage;
  note: string | null;
}

export interface CandidacyView {
  id: string;
  legacyRef: string | null;
  stage: CandidacyStage;
  source: string | null;
  interest: string | null;
  firstContactAt: Date | null;
  meetingAt: Date | null;
  nextAction: string | null;
  followUpAt: Date | null;
  followUp: FollowUpState;
  ownerId: string | null;
  owner: string | null;
  notes: string | null;
  abandonReason: AbandonReason | null;
  abandonNote: string | null;
  closedAt: Date | null;
  idleDays: number;
  events: CandidacyEventView[];
  transitions: AllowedTransition[];
}

export interface MentorshipView {
  id: string;
  mentorId: string;
  mentorName: string;
  mentorRef: string;
  startDate: Date;
  endDate: Date | null;
  note: string | null;
  current: boolean;
}

export interface IntegrationTab {
  /** The open candidacy, or the abandoned one that can be resumed, or null. */
  current: CandidacyView | null;
  past: CandidacyView[];
  owners: OwnerOption[];
  sources: string[];
  followUpDays: number;
  defaultNextActions: Record<string, string>;
  mentorships: MentorshipView[] | null;
  mentorSuggestions: MentorSuggestion[];
  canManageMentorship: boolean;
  /** Left or inactive with no open candidacy: « Réengager » is offered. */
  canReengage: boolean;
  personStatus: PersonStatus;
}

/** Data of the « Intégration » tab (`candidacy.manage`). */
export async function integrationTab(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
  day: Date = toParisDay(),
): Promise<IntegrationTab> {
  authorize(actor, "candidacy.manage", { person: facts });
  const canManageMentorship = can(actor, "mentorship.manage", { person: facts }).allowed;
  const [candidacies, owners, sources, settings, mentorships, person] = await Promise.all([
    db.candidacy.findMany({
      where: { personId },
      orderBy: { createdAt: "desc" },
      include: {
        owner: { select: { name: true } },
        events: { orderBy: { at: "desc" }, include: { author: { select: { name: true } } } },
      },
    }),
    ownerOptions(db),
    sourceSuggestions(db),
    numericSettings(db),
    canManageMentorship
      ? db.mentorship.findMany({
          where: { menteeId: personId },
          orderBy: { startDate: "desc" },
          include: { mentor: { select: { id: true, ref: true, firstName: true, lastName: true } } },
        })
      : Promise.resolve(null),
    db.person.findUniqueOrThrow({ where: { id: personId }, select: { status: true } }),
  ]);
  const views = candidacies.map((c): CandidacyView => {
    const abandonedFromStage = c.events.find((e) => e.toStage === "ABANDONED")?.fromStage ?? null;
    const lastAt = c.events[0]?.at ?? c.createdAt;
    return {
      id: c.id,
      legacyRef: c.legacyRef,
      stage: c.stage,
      source: c.source,
      interest: c.interest,
      firstContactAt: c.firstContactAt,
      meetingAt: c.meetingAt,
      nextAction: c.nextAction,
      followUpAt: c.followUpAt,
      followUp: c.closedAt ? "none" : followUpState(c.followUpAt, day),
      ownerId: c.ownerId,
      owner: c.owner?.name ?? null,
      notes: c.notes,
      abandonReason: c.abandonReason,
      abandonNote: c.abandonNote,
      closedAt: c.closedAt,
      idleDays: idleDays(toParisDay(lastAt), day),
      events: c.events.map((e) => ({
        id: e.id,
        at: e.at,
        author: e.author?.name ?? null,
        fromStage: e.fromStage,
        toStage: e.toStage,
        note: e.note,
      })),
      transitions: availableTransitions(c.stage, { abandonedFrom: abandonedFromStage }),
    };
  });
  const open = views.find((v) => v.closedAt === null) ?? null;
  // The latest abandoned candidacy stays « current » (resumable) while none is open.
  const latest = views[0] ?? null;
  const current = open ?? (latest?.stage === "ABANDONED" ? latest : null);
  return {
    current,
    past: views.filter((v) => v !== current),
    owners,
    sources,
    followUpDays: settings.candidacyFollowUpDays,
    defaultNextActions: DEFAULT_NEXT_ACTIONS,
    mentorships:
      mentorships?.map((m) => ({
        id: m.id,
        mentorId: m.mentor.id,
        mentorName: `${m.mentor.firstName} ${m.mentor.lastName}`,
        mentorRef: m.mentor.ref,
        startDate: m.startDate,
        endDate: m.endDate,
        note: m.note,
        current:
          m.startDate.getTime() <= day.getTime() &&
          (m.endDate === null || m.endDate.getTime() >= day.getTime()),
      })) ?? null,
    mentorSuggestions: canManageMentorship ? await mentorSuggestions(db, personId, day) : [],
    canManageMentorship,
    canReengage:
      (person.status === "LEFT" || person.status === "INACTIVE") &&
      open === null &&
      can(actor, "candidacy.create").allowed,
    personStatus: person.status,
  };
}
