import { Prisma } from "@/generated/prisma/client";
import type {
  Profile,
  ReferenceCategory,
  ReferenceKind,
  TrainingResult,
  TrainingWishStatus,
} from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import { withAudit, type Actor as AuditActor } from "../audit";
import type { Db, DbOrTx } from "../db";
import { DomainError } from "../errors";
import { notifyUrgence, type UrgenceOutcome } from "./urgence";
import { authorize, can, canSome } from "../policy/can";
import { loadFunctionFacts, loadPersonFactsMany, newVolunteerMonths } from "../policy/facts";
import type { Actor, PersonFacts } from "../policy/types";
import { visibleSql } from "../policy/visibility";
import {
  functionState,
  isValidState,
  trainingState,
  type QualificationStatus,
} from "../qualification";
import { computeExpiresAt } from "../reference";
import { agesOf } from "../sensitive";
import { numericSettings } from "../settings";
import { directoryTerms, termSql } from "./directory";
import { appointmentWarnings, trainingWarnings, warningsKey, type Warning } from "../warnings";

/**
 * Trainings, competences and appointments (step 10, docs/formations.md).
 * Pegass is the reference for diplomas: Binivol reflects, it delivers nothing.
 * Every write is audited; cancellations are traced, never deleted.
 */

const auditActor = (actor: Actor): AuditActor => ({ userId: actor.userId, label: actor.name });

// ---------------------------------------------------------------------------
// Reference list
// ---------------------------------------------------------------------------

export interface ReferenceOption {
  id: string;
  code: string;
  label: string;
  category: ReferenceCategory;
  kind: ReferenceKind;
  validityMonths: number | null;
  expiresEndOfYear: boolean;
  forbiddenForMinors: boolean;
  managedBy: Profile[];
  active: boolean;
  note: string | null;
  prerequisites: { id: string; code: string; label: string }[];
}

export async function referenceOptions(
  db: DbOrTx,
  options: { includeInactive?: boolean; kind?: ReferenceKind } = {},
): Promise<ReferenceOption[]> {
  const rows = await db.referenceItem.findMany({
    where: {
      ...(options.includeInactive ? {} : { active: true }),
      ...(options.kind ? { kind: options.kind } : {}),
    },
    orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    include: {
      prerequisites: {
        include: { prerequisite: { select: { id: true, code: true, label: true } } },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    label: r.label,
    category: r.category,
    kind: r.kind,
    validityMonths: r.validityMonths,
    expiresEndOfYear: r.expiresEndOfYear,
    forbiddenForMinors: r.forbiddenForMinors,
    managedBy: r.managedBy,
    active: r.active,
    note: r.note,
    prerequisites: r.prerequisites.map((p) => p.prerequisite),
  }));
}

/** Edits a reference item (`reference.manage`). Never deleted: `active` instead. */
export async function updateReferenceItem(
  db: Db,
  actor: Actor,
  input: {
    id: string;
    label: string;
    category: ReferenceCategory;
    validityMonths: number | null;
    expiresEndOfYear: boolean;
    forbiddenForMinors: boolean;
    managedBy: Profile[];
    active: boolean;
    prerequisiteIds: string[];
  },
): Promise<void> {
  authorize(actor, "reference.manage");
  if (input.prerequisiteIds.includes(input.id)) {
    throw new DomainError("INVALID_DATA", "Une formation ne peut pas être son propre prérequis.");
  }
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const before = await tx.referenceItem.findUniqueOrThrow({ where: { id: input.id } });
    if (before.kind === "TRAINING" && input.managedBy.length > 0) {
      throw new DomainError("INVALID_DATA", "Seule une fonction a des profils de nomination.");
    }
    const after = await tx.referenceItem.update({
      where: { id: input.id },
      data: {
        label: input.label,
        category: input.category,
        validityMonths: input.validityMonths,
        expiresEndOfYear: input.expiresEndOfYear,
        forbiddenForMinors: input.forbiddenForMinors,
        managedBy: input.managedBy,
        active: input.active,
        updatedById: actor.userId,
      },
    });
    audit.updated("ReferenceItem", input.id, before, after);
    const current = await tx.referenceItemPrerequisite.findMany({ where: { itemId: input.id } });
    const wanted = new Set(input.prerequisiteIds);
    for (const c of current) {
      if (!wanted.has(c.prerequisiteId)) {
        // A link of the reference configuration (no history of its own): removed, audited.
        await tx.referenceItemPrerequisite.delete({
          where: { itemId_prerequisiteId: { itemId: c.itemId, prerequisiteId: c.prerequisiteId } },
        });
        audit.log({
          action: "UPDATE",
          entity: "ReferenceItem",
          entityId: input.id,
          field: "prerequisites",
          oldValue: c.prerequisiteId,
        });
      }
    }
    for (const id of wanted) {
      if (current.some((c) => c.prerequisiteId === id)) continue;
      await tx.referenceItemPrerequisite.create({
        data: { itemId: input.id, prerequisiteId: id },
      });
      audit.log({
        action: "UPDATE",
        entity: "ReferenceItem",
        entityId: input.id,
        field: "prerequisites",
        newValue: id,
      });
    }
    // Validity changed: every live line is recomputed.
    if (
      before.validityMonths !== after.validityMonths ||
      before.expiresEndOfYear !== after.expiresEndOfYear
    ) {
      const records = await tx.trainingRecord.findMany({
        where: { referenceId: input.id, result: "PASSED", cancelledAt: null },
        select: { id: true, date: true },
      });
      for (const r of records) {
        await tx.trainingRecord.update({
          where: { id: r.id },
          data: { expiresAt: computeExpiresAt(after, r.date) },
        });
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export interface SessionRow {
  id: string;
  code: string;
  label: string;
  startDate: Date;
  endDate: Date | null;
  place: string | null;
  pegassUrl: string | null;
  capacity: number | null;
  registered: number;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export async function listSessions(
  db: DbOrTx,
  actor: Actor,
  when: "upcoming" | "past",
  day: Date = toParisDay(),
): Promise<SessionRow[]> {
  authorize(actor, "trainingSession.manage");
  const rows = await db.trainingSession.findMany({
    where: when === "upcoming" ? { startDate: { gte: day } } : { startDate: { lt: day } },
    orderBy: { startDate: when === "upcoming" ? "asc" : "desc" },
    take: 100,
    include: {
      reference: { select: { code: true, label: true } },
      _count: { select: { records: { where: { cancelledAt: null } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    code: r.reference.code,
    label: r.reference.label,
    startDate: r.startDate,
    endDate: r.endDate,
    place: r.place,
    pegassUrl: r.pegassUrl,
    capacity: r.capacity,
    registered: r._count.records,
    cancelledAt: r.cancelledAt,
    cancelReason: r.cancelReason,
  }));
}

export async function createSession(
  db: Db,
  actor: Actor,
  input: {
    referenceId: string;
    startDate: Date;
    endDate: Date | null;
    place: string | null;
    pegassUrl: string | null;
    capacity: number | null;
  },
): Promise<string> {
  authorize(actor, "trainingSession.manage");
  if (input.endDate && input.endDate.getTime() < input.startDate.getTime()) {
    throw new DomainError("INVALID_DATA", "La date de fin est avant la date de début.");
  }
  return withAudit(db, auditActor(actor), async (tx, audit) => {
    const reference = await tx.referenceItem.findUniqueOrThrow({
      where: { id: input.referenceId },
    });
    if (reference.kind !== "TRAINING") {
      throw new DomainError("INVALID_DATA", "Une session porte sur une formation.");
    }
    const row = await tx.trainingSession.create({
      data: { ...input, createdById: actor.userId, updatedById: actor.userId },
    });
    audit.created("TrainingSession", row.id, row);
    return row.id;
  });
}

export async function cancelSession(
  db: Db,
  actor: Actor,
  input: { sessionId: string; reason: string },
): Promise<void> {
  authorize(actor, "trainingSession.manage");
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const { count } = await tx.trainingSession.updateMany({
      where: { id: input.sessionId, cancelledAt: null },
      data: {
        cancelledAt: new Date(),
        cancelledById: actor.userId,
        cancelReason: input.reason,
        updatedById: actor.userId,
      },
    });
    if (count === 0) throw new DomainError("INVALID_DATA", "Cette session est déjà annulée.");
    audit.cancelled("TrainingSession", input.sessionId, input.reason);
  });
}

export interface SessionDetail extends SessionRow {
  referenceId: string;
  lines: {
    id: string;
    personId: string;
    ref: string;
    firstName: string;
    lastName: string;
    result: TrainingResult;
    date: Date | null;
    cancelledAt: Date | null;
  }[];
  waiting: WishRow[];
}

export async function sessionDetail(
  db: DbOrTx,
  actor: Actor,
  sessionId: string,
): Promise<SessionDetail | null> {
  authorize(actor, "trainingSession.manage");
  const s = await db.trainingSession.findUnique({
    where: { id: sessionId },
    include: {
      reference: { select: { code: true, label: true } },
      records: {
        orderBy: [{ cancelledAt: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
        include: { person: { select: { id: true, ref: true, firstName: true, lastName: true } } },
      },
    },
  });
  if (!s) return null;
  const waiting = (await waitingLists(db, actor, { referenceId: s.referenceId })).flatMap(
    (g) => g.wishes,
  );
  return {
    id: s.id,
    referenceId: s.referenceId,
    code: s.reference.code,
    label: s.reference.label,
    startDate: s.startDate,
    endDate: s.endDate,
    place: s.place,
    pegassUrl: s.pegassUrl,
    capacity: s.capacity,
    registered: s.records.filter((r) => r.cancelledAt === null).length,
    cancelledAt: s.cancelledAt,
    cancelReason: s.cancelReason,
    lines: s.records.map((r) => ({
      id: r.id,
      personId: r.person.id,
      ref: r.person.ref,
      firstName: r.person.firstName,
      lastName: r.person.lastName,
      result: r.result,
      date: r.date,
      cancelledAt: r.cancelledAt,
    })),
    waiting: waiting.filter((w) => w.status !== "SCHEDULED"),
  };
}

// ---------------------------------------------------------------------------
// Group entry (and single entry): warnings first, then one transaction
// ---------------------------------------------------------------------------

export interface GroupEntryInput {
  referenceId: string;
  /** Obtention date (PASSED), or date of the training; null when unknown. */
  date: Date | null;
  result: "REGISTERED" | "PASSED" | "FAILED" | "ABSENT" | "TO_CONFIRM";
  personIds: string[];
  sessionId?: string | null;
  place?: string | null;
  comment?: string | null;
  /** Key of the warnings the user accepted (« Enregistrer quand même »). */
  acceptedWarnings?: string | null;
}

export type GroupEntryResult =
  | { saved: true; recordIds: string[]; warnings: Warning[]; urgence: UrgenceOutcome }
  | { saved: false; warnings: Warning[]; warningsKey: string };

/** States of every competence of these people on `day` (prerequisites, Trouver). */
async function validCodesOf(
  db: DbOrTx,
  personIds: readonly string[],
  day: Date,
  alertDays: number,
): Promise<Map<string, Set<string>>> {
  const [records, appointments] = await Promise.all([
    db.trainingRecord.findMany({
      where: { personId: { in: [...personIds] }, cancelledAt: null },
      select: {
        personId: true,
        result: true,
        date: true,
        expiresAt: true,
        cancelledAt: true,
        reference: { select: { code: true } },
        session: { select: { startDate: true } },
      },
    }),
    db.appointment.findMany({
      where: { personId: { in: [...personIds] }, cancelledAt: null },
      select: {
        personId: true,
        startDate: true,
        endDate: true,
        cancelledAt: true,
        reference: { select: { code: true } },
      },
    }),
  ]);
  const out = new Map<string, Set<string>>(personIds.map((id) => [id, new Set<string>()]));
  const byKey = new Map<string, typeof records>();
  for (const r of records) {
    const key = `${r.personId}|${r.reference.code}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  for (const [key, rs] of byKey) {
    const [personId = "", code = ""] = key.split("|");
    const state = trainingState(
      rs.map((r) => ({ ...r, sessionStart: r.session?.startDate ?? null })),
      day,
      alertDays,
    );
    if (isValidState(state.status)) out.get(personId)?.add(code);
  }
  for (const a of appointments) {
    if (functionState([a], day).status === "FUNCTION_ACTIVE")
      out.get(a.personId)?.add(a.reference.code);
  }
  return out;
}

/**
 * Records one training for a group (« saisie de groupe »): the warnings of
 * the whole group are computed at once; if any, nothing is written until the
 * same warnings are accepted. Then one transaction, the accepted warnings in
 * the audit. Real errors (a person not visible, a cancelled session) block.
 */
export async function recordTrainingGroup(
  db: Db,
  actor: Actor,
  input: GroupEntryInput,
  today: Date = toParisDay(),
): Promise<GroupEntryResult> {
  const ids = [...new Set(input.personIds)];
  if (ids.length === 0) throw new DomainError("INVALID_DATA", "Choisissez au moins une personne.");
  if (ids.length > 60) throw new DomainError("INVALID_DATA", "60 personnes au plus par saisie.");
  const facts = await loadPersonFactsMany(db, ids, today);
  for (const id of ids) {
    const f = facts.get(id);
    if (!f) throw new DomainError("INVALID_DATA", "Personne introuvable.");
    authorize(actor, "training.write", { person: f });
  }
  const reference = await db.referenceItem.findUniqueOrThrow({
    where: { id: input.referenceId },
    include: {
      prerequisites: { include: { prerequisite: { select: { code: true, label: true } } } },
    },
  });
  if (reference.kind !== "TRAINING") {
    throw new DomainError("INVALID_DATA", "Choisissez une formation (pas une fonction).");
  }
  const session = input.sessionId
    ? await db.trainingSession.findUnique({
        where: { id: input.sessionId },
        include: { _count: { select: { records: { where: { cancelledAt: null } } } } },
      })
    : null;
  if (input.sessionId && session?.referenceId !== reference.id) {
    throw new DomainError("INVALID_DATA", "Session introuvable pour cette formation.");
  }
  if (session?.cancelledAt) throw new DomainError("INVALID_DATA", "Cette session est annulée.");
  const date = input.date ?? session?.startDate ?? null;
  const { alertDays } = await numericSettings(db);
  const [people, valid, sameLines] = await Promise.all([
    db.person.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, status: true },
    }),
    validCodesOf(db, ids, date ?? today, alertDays),
    db.trainingRecord.findMany({
      where: {
        personId: { in: ids },
        referenceId: reference.id,
        cancelledAt: null,
        date: { not: null },
      },
      select: { personId: true, date: true },
    }),
  ]);
  const warnings = trainingWarnings(
    {
      reference: {
        code: reference.code,
        label: reference.label,
        prerequisites: reference.prerequisites.map((p) => p.prerequisite),
      },
      date,
      result: input.result,
      today,
      session: session ? { capacity: session.capacity, registered: session._count.records } : null,
    },
    people.map((p) => ({
      id: p.id,
      name: `${p.firstName} ${p.lastName}`,
      status: p.status,
      validCodes: valid.get(p.id) ?? new Set(),
      sameTrainingDates: sameLines
        .filter((l) => l.personId === p.id && l.date)
        .map((l) => l.date?.toISOString().slice(0, 10) ?? ""),
    })),
  );
  const key = warningsKey(warnings);
  if (warnings.length > 0 && input.acceptedWarnings !== key) {
    return { saved: false, warnings, warningsKey: key };
  }
  const expiresAt =
    input.result === "PASSED"
      ? computeExpiresAt(
          {
            validityMonths: reference.validityMonths,
            expiresEndOfYear: reference.expiresEndOfYear,
          },
          date,
        )
      : null;
  const recordIds = await withAudit(db, auditActor(actor), async (tx, audit) => {
    const created: string[] = [];
    for (const id of ids) {
      const row = await tx.trainingRecord.create({
        data: {
          personId: id,
          referenceId: reference.id,
          sessionId: session?.id ?? null,
          date,
          result: input.result,
          place: input.place ?? session?.place ?? null,
          pegassUrl: session?.pegassUrl ?? null,
          comment: input.comment ?? null,
          expiresAt,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      });
      audit.created("TrainingRecord", row.id, row);
      created.push(row.id);
      if (input.result === "PASSED") await closeWish(tx, actor, audit, id, reference.id);
    }
    if (warnings.length > 0) {
      audit.log({
        action: "CREATE",
        entity: "TrainingRecord",
        field: "acceptedWarnings",
        newValue: warnings.map((w) => w.message),
      });
    }
    return created;
  });
  // After the transaction: the entry is kept whatever happens to the e-mail.
  const urgence = await notifyUrgence(db, actor, {
    reference,
    result: input.result,
    date,
    recordIds,
  });
  return { saved: true, recordIds, warnings, urgence };
}

async function closeWish(
  tx: Prisma.TransactionClient,
  actor: Actor,
  audit: Parameters<Parameters<typeof withAudit>[2]>[1],
  personId: string,
  referenceId: string,
): Promise<void> {
  const open = await tx.trainingWish.findMany({
    where: { personId, referenceId, status: { in: ["OPEN", "WAITLISTED", "SCHEDULED"] } },
  });
  for (const w of open) {
    const after = await tx.trainingWish.update({
      where: { id: w.id },
      data: { status: "DONE", updatedById: actor.userId },
    });
    audit.updated("TrainingWish", w.id, w, after);
  }
}

/** Sets the result of lines (one by one or in bulk); `expiresAt` recomputed. */
export async function setTrainingResults(
  db: Db,
  actor: Actor,
  input: { recordIds: string[]; result: TrainingResult; date: Date | null },
  today: Date = toParisDay(),
): Promise<number> {
  const rows = await db.trainingRecord.findMany({
    where: { id: { in: input.recordIds }, cancelledAt: null },
    include: { reference: true, session: { select: { startDate: true } } },
  });
  if (rows.length === 0) throw new DomainError("INVALID_DATA", "Aucune ligne à modifier.");
  const facts = await loadPersonFactsMany(db, [...new Set(rows.map((r) => r.personId))], today);
  for (const r of rows) {
    const f = facts.get(r.personId);
    if (!f) throw new DomainError("INVALID_DATA", "Personne introuvable.");
    authorize(actor, "training.write", { person: f });
  }
  const count = await withAudit(db, auditActor(actor), async (tx, audit) => {
    for (const r of rows) {
      const date = input.date ?? r.date ?? r.session?.startDate ?? null;
      const after = await tx.trainingRecord.update({
        where: { id: r.id },
        data: {
          result: input.result,
          date,
          expiresAt: input.result === "PASSED" ? computeExpiresAt(r.reference, date) : null,
          updatedById: actor.userId,
        },
      });
      const { reference: _reference, session: _session, ...before } = r;
      audit.updated("TrainingRecord", r.id, before, after);
      if (input.result === "PASSED") await closeWish(tx, actor, audit, r.personId, r.referenceId);
    }
    return rows.length;
  });
  // One notice per training of the batch, after the transaction.
  for (const referenceId of new Set(rows.map((r) => r.referenceId))) {
    const lines = rows.filter((r) => r.referenceId === referenceId);
    const first = lines[0];
    if (!first) continue;
    await notifyUrgence(db, actor, {
      reference: first.reference,
      result: input.result,
      date: input.date ?? first.date ?? first.session?.startDate ?? null,
      recordIds: lines.map((r) => r.id),
    });
  }
  return count;
}

/** Cancels a line (reason required): never deleted, ignored by the states. */
export async function cancelTrainingRecord(
  db: Db,
  actor: Actor,
  input: { recordId: string; reason: string },
  today: Date = toParisDay(),
): Promise<void> {
  const row = await db.trainingRecord.findUniqueOrThrow({ where: { id: input.recordId } });
  const f = (await loadPersonFactsMany(db, [row.personId], today)).get(row.personId);
  if (!f) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  authorize(actor, "training.write", { person: f });
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const { count } = await tx.trainingRecord.updateMany({
      where: { id: row.id, cancelledAt: null },
      data: {
        cancelledAt: new Date(),
        cancelledById: actor.userId,
        cancelReason: input.reason,
        updatedById: actor.userId,
      },
    });
    if (count === 0) throw new DomainError("INVALID_DATA", "Cette ligne est déjà annulée.");
    audit.cancelled("TrainingRecord", row.id, input.reason);
  });
}

// ---------------------------------------------------------------------------
// Waiting lists (training wishes)
// ---------------------------------------------------------------------------

export interface WishRow {
  id: string;
  personId: string;
  ref: string;
  firstName: string;
  lastName: string;
  status: TrainingWishStatus;
  priority: number;
  comment: string | null;
  createdAt: Date;
}

export interface WaitingList {
  referenceId: string;
  code: string;
  label: string;
  wishes: WishRow[];
}

/** Pure order of a waiting list: priority (high first), then seniority. */
export function sortWishes<T extends { priority: number; createdAt: Date }>(
  wishes: readonly T[],
): T[] {
  return [...wishes].sort(
    (a, b) => b.priority - a.priority || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

export async function waitingLists(
  db: DbOrTx,
  actor: Actor,
  filter: { referenceId?: string } = {},
  day: Date = toParisDay(),
): Promise<WaitingList[]> {
  authorize(actor, "trainingSession.manage");
  const ctx = { day, newVolunteerMonths: await newVolunteerMonths(db) };
  const visible = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM persons p WHERE ${visibleSql(actor, "trainingWish.manage", ctx)}`;
  const rows = await db.trainingWish.findMany({
    where: {
      status: { in: ["OPEN", "WAITLISTED", "SCHEDULED"] },
      personId: { in: visible.map((v) => v.id) },
      ...(filter.referenceId ? { referenceId: filter.referenceId } : {}),
    },
    include: {
      person: { select: { ref: true, firstName: true, lastName: true } },
      reference: { select: { code: true, label: true, sortOrder: true } },
    },
  });
  const groups = new Map<string, WaitingList & { sortOrder: number }>();
  for (const w of rows) {
    const g = groups.get(w.referenceId) ?? {
      referenceId: w.referenceId,
      code: w.reference.code,
      label: w.reference.label,
      sortOrder: w.reference.sortOrder,
      wishes: [],
    };
    g.wishes.push({
      id: w.id,
      personId: w.personId,
      ref: w.person.ref,
      firstName: w.person.firstName,
      lastName: w.person.lastName,
      status: w.status,
      priority: w.priority,
      comment: w.comment,
      createdAt: w.createdAt,
    });
    groups.set(w.referenceId, g);
  }
  return [...groups.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
    .map(({ sortOrder: _s, ...g }) => ({ ...g, wishes: sortWishes(g.wishes) }));
}

export async function addTrainingWish(
  db: Db,
  actor: Actor,
  input: { personId: string; referenceId: string; priority: number; comment: string | null },
  today: Date = toParisDay(),
): Promise<string> {
  const f = (await loadPersonFactsMany(db, [input.personId], today)).get(input.personId);
  if (!f) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  authorize(actor, "trainingWish.manage", { person: f });
  try {
    return await withAudit(db, auditActor(actor), async (tx, audit) => {
      const row = await tx.trainingWish.create({
        data: { ...input, status: "OPEN", createdById: actor.userId, updatedById: actor.userId },
      });
      audit.created("TrainingWish", row.id, row);
      return row.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new DomainError(
        "TRAINING_WISH_ALREADY_OPEN",
        "Un souhait est déjà ouvert pour cette formation.",
      );
    }
    throw error;
  }
}

/** « Inscrire à une session »: the wish becomes a registration (SCHEDULED). */
export async function scheduleWish(
  db: Db,
  actor: Actor,
  input: { wishId: string; sessionId: string },
  today: Date = toParisDay(),
): Promise<string> {
  authorize(actor, "trainingSession.manage");
  const wish = await db.trainingWish.findUniqueOrThrow({ where: { id: input.wishId } });
  const session = await db.trainingSession.findUniqueOrThrow({ where: { id: input.sessionId } });
  if (session.referenceId !== wish.referenceId || session.cancelledAt) {
    throw new DomainError("INVALID_DATA", "Session introuvable pour ce souhait.");
  }
  const f = (await loadPersonFactsMany(db, [wish.personId], today)).get(wish.personId);
  if (!f) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  authorize(actor, "training.write", { person: f });
  return withAudit(db, auditActor(actor), async (tx, audit) => {
    const { count } = await tx.trainingWish.updateMany({
      where: { id: wish.id, status: { in: ["OPEN", "WAITLISTED"] } },
      data: { status: "SCHEDULED", sessionId: session.id, updatedById: actor.userId },
    });
    if (count === 0) throw new DomainError("INVALID_DATA", "Ce souhait n'est plus en attente.");
    audit.log({
      action: "UPDATE",
      entity: "TrainingWish",
      entityId: wish.id,
      field: "status",
      oldValue: wish.status,
      newValue: "SCHEDULED",
    });
    const row = await tx.trainingRecord.create({
      data: {
        personId: wish.personId,
        referenceId: wish.referenceId,
        sessionId: session.id,
        date: session.startDate,
        result: "REGISTERED",
        place: session.place,
        pegassUrl: session.pegassUrl,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });
    audit.created("TrainingRecord", row.id, row);
    return row.id;
  });
}

// ---------------------------------------------------------------------------
// Trouver: a team with up to 3 valid competences (AND)
// ---------------------------------------------------------------------------

export interface FoundPerson {
  id: string;
  ref: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  states: { code: string; status: QualificationStatus }[];
}

/**
 * Present people (ACTIVE, PAUSED: never SUSPENDED) holding every requested
 * competence, filtered by the directory visibility **in SQL** before
 * counting. A competence is held when its state is valid (see
 * `qualification.ts`): a pass not expired (dated or not), or an active
 * appointment for a function. The pure state is then computed for display.
 */
export async function findTeam(
  db: DbOrTx,
  actor: Actor,
  input: { codes: string[]; q: string },
  day: Date = toParisDay(),
): Promise<{ total: number; people: FoundPerson[] }> {
  // The list is filtered by the directory visibility (SQL); the page requires `training.read`.
  if (!canSome(actor, "training.read")) authorize(actor, "training.read");
  const codes = [...new Set(input.codes.map((c) => c.trim()).filter(Boolean))].slice(0, 3);
  const ctx = { day, newVolunteerMonths: await newVolunteerMonths(db) };
  const conditions: Prisma.Sql[] = [
    visibleSql(actor, "person.directory.read", ctx),
    Prisma.sql`p.status IN ('ACTIVE'::"PersonStatus", 'PAUSED'::"PersonStatus")`,
    Prisma.sql`p.archived_at IS NULL`,
  ];
  for (const code of codes) {
    conditions.push(Prisma.sql`(
      EXISTS (SELECT 1 FROM training_records t JOIN reference_items r ON r.id = t.reference_id
              WHERE t.person_id = p.id AND r.code = ${code} AND t.result = 'PASSED'::"TrainingResult"
                AND t.cancelled_at IS NULL AND (t.expires_at IS NULL OR t.expires_at >= ${day}::date))
      OR EXISTS (SELECT 1 FROM appointments a JOIN reference_items r ON r.id = a.reference_id
              WHERE a.person_id = p.id AND r.code = ${code} AND a.cancelled_at IS NULL
                AND (a.start_date IS NULL OR a.start_date <= ${day}::date)
                AND (a.end_date IS NULL OR a.end_date >= ${day}::date)))`);
  }
  for (const term of directoryTerms(input.q)) conditions.push(termSql(term));
  const where = Prisma.join(conditions, " AND ");
  const [count] = await db.$queryRaw<
    { n: bigint }[]
  >`SELECT count(*) AS n FROM persons p WHERE ${where}`;
  const rows = await db.$queryRaw<
    {
      id: string;
      ref: string;
      first_name: string;
      last_name: string;
      phone: string | null;
      email: string | null;
    }[]
  >`SELECT p.id, p.ref, p.first_name, p.last_name, p.phone, p.email FROM persons p WHERE ${where}
    ORDER BY p.last_name, p.first_name LIMIT 200`;
  const { alertDays } = await numericSettings(db);
  const states: Map<string, QualificationStatus> =
    codes.length > 0
      ? await statesOf(
          db,
          rows.map((r) => r.id),
          codes,
          day,
          alertDays,
        )
      : new Map<string, QualificationStatus>();
  return {
    total: Number(count?.n ?? 0),
    people: rows.map((r) => ({
      id: r.id,
      ref: r.ref,
      firstName: r.first_name,
      lastName: r.last_name,
      phone: r.phone,
      email: r.email,
      states: codes.map((code) => ({ code, status: states.get(`${r.id}|${code}`) ?? "NONE" })),
    })),
  };
}

async function statesOf(
  db: DbOrTx,
  personIds: string[],
  codes: string[],
  day: Date,
  alertDays: number,
): Promise<Map<string, QualificationStatus>> {
  const [records, appointments] = await Promise.all([
    db.trainingRecord.findMany({
      where: { personId: { in: personIds }, reference: { code: { in: codes } } },
      select: {
        personId: true,
        result: true,
        date: true,
        expiresAt: true,
        cancelledAt: true,
        reference: { select: { code: true } },
        session: { select: { startDate: true } },
      },
    }),
    db.appointment.findMany({
      where: { personId: { in: personIds }, reference: { code: { in: codes } } },
      select: {
        personId: true,
        startDate: true,
        endDate: true,
        cancelledAt: true,
        reference: { select: { code: true } },
      },
    }),
  ]);
  const out = new Map<string, QualificationStatus>();
  for (const id of personIds) {
    for (const code of codes) {
      const rs = records.filter((r) => r.personId === id && r.reference.code === code);
      const as = appointments.filter((a) => a.personId === id && a.reference.code === code);
      const status =
        as.length > 0
          ? functionState(as, day).status
          : trainingState(
              rs.map((r) => ({ ...r, sessionStart: r.session?.startDate ?? null })),
              day,
              alertDays,
            ).status;
      out.set(`${id}|${code}`, status);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Appointments (functions)
// ---------------------------------------------------------------------------

export type AppointmentResult =
  | { saved: true; id: string; warnings: Warning[] }
  | { saved: false; warnings: Warning[]; warningsKey: string };

/**
 * Appoints a person to a function. Allowed to the profiles of the
 * function's `managedBy` and to TOPAZE (the policy decides). A minor and a
 * function forbidden to minors: **blocking** refusal. Other checks warn.
 */
export async function createAppointment(
  db: Db,
  actor: Actor,
  input: {
    personId: string;
    referenceId: string;
    startDate: Date;
    authorizedBy: string | null;
    decisionRef: string | null;
    comment: string | null;
    acceptedWarnings?: string | null;
  },
  today: Date = toParisDay(),
): Promise<AppointmentResult> {
  const f = (await loadPersonFactsMany(db, [input.personId], today)).get(input.personId);
  const fn = await loadFunctionFacts(db, input.referenceId);
  if (!f || !fn) throw new DomainError("INVALID_DATA", "Personne ou fonction introuvable.");
  authorize(actor, "appointment.write", { person: f, function: fn });
  const reference = await db.referenceItem.findUniqueOrThrow({ where: { id: input.referenceId } });
  if (reference.kind !== "FUNCTION")
    throw new DomainError("APPOINTMENT_NOT_A_FUNCTION", "Choisissez une fonction.");
  const age = (await agesOf(db, [input.personId], today)).get(input.personId) ?? null;
  if (reference.forbiddenForMinors && age !== null && age < 18) {
    throw new DomainError(
      "INVALID_DATA",
      `${reference.code} est interdite aux mineurs : nomination impossible avant 18 ans.`,
    );
  }
  const person = await db.person.findUniqueOrThrow({
    where: { id: input.personId },
    select: { firstName: true, lastName: true, status: true },
  });
  const warnings = appointmentWarnings({
    name: `${person.firstName} ${person.lastName}`,
    status: person.status,
    authorizedBy: input.authorizedBy,
  });
  const key = warningsKey(warnings);
  if (warnings.length > 0 && input.acceptedWarnings !== key)
    return { saved: false, warnings, warningsKey: key };
  const id = await withAudit(db, auditActor(actor), async (tx, audit) => {
    const row = await tx.appointment.create({
      data: {
        personId: input.personId,
        referenceId: input.referenceId,
        startDate: input.startDate,
        authorizedBy: input.authorizedBy,
        decisionRef: input.decisionRef,
        comment: input.comment,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });
    audit.created("Appointment", row.id, row);
    if (warnings.length > 0) {
      audit.log({
        action: "CREATE",
        entity: "Appointment",
        entityId: row.id,
        field: "acceptedWarnings",
        newValue: warnings.map((w) => w.message),
      });
    }
    return row.id;
  });
  return { saved: true, id, warnings };
}

async function appointmentResource(db: DbOrTx, appointmentId: string, today: Date) {
  const row = await db.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
  const f = (await loadPersonFactsMany(db, [row.personId], today)).get(row.personId);
  const fn = await loadFunctionFacts(db, row.referenceId);
  if (!f || !fn) throw new DomainError("INVALID_DATA", "Nomination introuvable.");
  return { row, resource: { person: f, function: fn } };
}

export async function endAppointment(
  db: Db,
  actor: Actor,
  input: { appointmentId: string; endDate: Date },
  today: Date = toParisDay(),
): Promise<void> {
  const { row, resource } = await appointmentResource(db, input.appointmentId, today);
  authorize(actor, "appointment.write", resource);
  if (row.startDate && input.endDate.getTime() < row.startDate.getTime()) {
    throw new DomainError("INVALID_DATA", "La date de fin est avant la date de début.");
  }
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const after = await tx.appointment.update({
      where: { id: row.id },
      data: { endDate: input.endDate, updatedById: actor.userId },
    });
    audit.updated("Appointment", row.id, row, after);
  });
}

export async function cancelAppointment(
  db: Db,
  actor: Actor,
  input: { appointmentId: string; reason: string },
  today: Date = toParisDay(),
): Promise<void> {
  const { row, resource } = await appointmentResource(db, input.appointmentId, today);
  authorize(actor, "appointment.write", resource);
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const { count } = await tx.appointment.updateMany({
      where: { id: row.id, cancelledAt: null },
      data: {
        cancelledAt: new Date(),
        cancelledById: actor.userId,
        cancelReason: input.reason,
        updatedById: actor.userId,
      },
    });
    if (count === 0) throw new DomainError("INVALID_DATA", "Cette nomination est déjà annulée.");
    audit.cancelled("Appointment", row.id, input.reason);
  });
}

/** Functions this actor may appoint this person to (select of the Fonctions tab). */
export async function appointableFunctions(
  db: DbOrTx,
  actor: Actor,
  person: PersonFacts,
): Promise<ReferenceOption[]> {
  const all = await referenceOptions(db, { kind: "FUNCTION" });
  return all.filter(
    (f) =>
      can(actor, "appointment.write", {
        person,
        function: { code: f.code, managedBy: f.managedBy },
      }).allowed,
  );
}

/** People the actor may enter a training for (group entry), directory fields only. */
export async function entryCandidates(
  db: DbOrTx,
  actor: Actor,
  day: Date = toParisDay(),
): Promise<{ id: string; ref: string; firstName: string; lastName: string; status: string }[]> {
  const ctx = { day, newVolunteerMonths: await newVolunteerMonths(db) };
  return db.$queryRaw<
    { id: string; ref: string; firstName: string; lastName: string; status: string }[]
  >`
    SELECT p.id, p.ref, p.first_name AS "firstName", p.last_name AS "lastName", p.status::text AS status
    FROM persons p
    WHERE ${visibleSql(actor, "training.write", ctx)} AND p.archived_at IS NULL
    ORDER BY p.last_name, p.first_name
    LIMIT 500`;
}

/** Policy resource of an existing appointment (its person and its function). */
export async function appointmentResourceOf(
  db: DbOrTx,
  appointmentId: string,
  today: Date = toParisDay(),
): Promise<{ person: PersonFacts; function: { code: string; managedBy: readonly Profile[] } }> {
  return (await appointmentResource(db, appointmentId, today)).resource;
}
