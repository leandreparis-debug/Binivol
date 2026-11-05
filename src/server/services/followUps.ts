import { Prisma } from "@/generated/prisma/client";
import type { FollowUpKind } from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import { withAudit } from "../audit";
import type { Db, DbOrTx } from "../db";
import { DomainError } from "../errors";
import { authorize, canSome } from "../policy/can";
import { loadPersonFactsMany, newVolunteerMonths } from "../policy/facts";
import type { Actor } from "../policy/types";
import { visibleSql } from "../policy/visibility";
import { numericSettings } from "../settings";
import {
  followUpBucket,
  mentorshipEndSuggested,
  nextAnniversary,
  type FollowUpBucket,
} from "../statusRules";

/**
 * Follow-ups and mentorships (step 11, docs/suivi.md). The 3-month point is
 * planned at the Gaia closure (step 9); completing a point plans the next
 * annual one. The short report (2 000 characters) is **not sensitive data**
 * but is never shown in a list (ADR-055).
 */

const auditActor = (actor: Actor) => ({ userId: actor.userId, label: actor.name });

export const SUMMARY_MAX = 2000;

/**
 * Completes a planned point: date, conducted by, short report, next date
 * (by default the next entry anniversary). The next point is planned as an
 * annual one, unless one is already planned.
 */
export async function completeFollowUp(
  db: Db,
  actor: Actor,
  input: {
    followUpId: string;
    doneAt: Date;
    conductedById: string | null;
    summary: string | null;
    nextDate: Date | null;
  },
  today: Date = toParisDay(),
): Promise<{ nextFollowUpId: string | null }> {
  const row = await db.followUp.findUniqueOrThrow({ where: { id: input.followUpId } });
  const facts = (await loadPersonFactsMany(db, [row.personId], today)).get(row.personId);
  if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  authorize(actor, "followUp.manage", { person: facts });
  if (row.cancelledAt) throw new DomainError("INVALID_DATA", "Ce point de suivi est annulé.");
  if ((input.summary ?? "").length > SUMMARY_MAX) {
    throw new DomainError("INVALID_DATA", "Le compte rendu fait 2 000 caractères au plus.");
  }
  const person = await db.person.findUniqueOrThrow({
    where: { id: row.personId },
    select: { entryDate: true },
  });
  const next = input.nextDate ?? nextAnniversary(person.entryDate, input.doneAt);
  if (next.getTime() <= input.doneAt.getTime()) {
    throw new DomainError("INVALID_DATA", "La prochaine date est avant le point.");
  }
  return withAudit(db, auditActor(actor), async (tx, audit) => {
    const { count } = await tx.followUp.updateMany({
      where: { id: row.id, doneAt: null },
      data: {
        doneAt: input.doneAt,
        conductedById: input.conductedById ?? actor.userId,
        summary: input.summary,
        nextDate: next,
        updatedById: actor.userId,
      },
    });
    if (count === 0) throw new DomainError("INVALID_DATA", "Ce point est déjà complété.");
    const after = await tx.followUp.findUniqueOrThrow({ where: { id: row.id } });
    audit.updated("FollowUp", row.id, row, after);
    const planned = await tx.followUp.count({
      where: { personId: row.personId, doneAt: null, cancelledAt: null, id: { not: row.id } },
    });
    if (planned > 0) return { nextFollowUpId: null };
    const kind: FollowUpKind = "ANNUAL";
    const created = await tx.followUp.create({
      data: {
        personId: row.personId,
        kind,
        scheduledAt: next,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });
    audit.created("FollowUp", created.id, created);
    return { nextFollowUpId: created.id };
  });
}

export interface BoardFollowUp {
  id: string;
  personId: string;
  ref: string;
  firstName: string;
  lastName: string;
  kind: FollowUpKind;
  scheduledAt: Date;
  bucket: FollowUpBucket;
  owner: string | null;
}

/**
 * Planned points (overdue, this week, this month), filtered by the visibility
 * of `followUp.manage` **in SQL**; optionally by responsible (the owner of the
 * person's latest candidacy).
 */
export async function followUpBoard(
  db: DbOrTx,
  actor: Actor,
  filter: { owner: string },
  day: Date = toParisDay(),
): Promise<BoardFollowUp[]> {
  if (!canSome(actor, "followUp.manage")) authorize(actor, "followUp.manage");
  const ctx = { day, newVolunteerMonths: await newVolunteerMonths(db) };
  const limit = new Date(day.getTime() + 31 * 86_400_000);
  const ownerId =
    filter.owner === "me" ? actor.userId : filter.owner === "all" ? null : filter.owner;
  const rows = await db.$queryRaw<
    {
      id: string;
      person_id: string;
      ref: string;
      first_name: string;
      last_name: string;
      kind: FollowUpKind;
      scheduled_at: Date;
      owner_id: string | null;
      owner: string | null;
    }[]
  >`
    SELECT f.id, f.person_id, p.ref, p.first_name, p.last_name, f.kind, f.scheduled_at,
           c.owner_id, u.name AS owner
    FROM follow_ups f
    JOIN persons p ON p.id = f.person_id
    LEFT JOIN LATERAL (
      SELECT owner_id FROM candidacies c WHERE c.person_id = p.id ORDER BY c.created_at DESC LIMIT 1
    ) c ON TRUE
    LEFT JOIN users u ON u.id = c.owner_id
    WHERE ${visibleSql(actor, "followUp.manage", ctx)}
      AND p.status IN ('ACTIVE'::"PersonStatus", 'PAUSED'::"PersonStatus")
      AND f.done_at IS NULL AND f.cancelled_at IS NULL AND f.scheduled_at IS NOT NULL
      AND f.scheduled_at <= ${limit}::date
      ${ownerId ? Prisma.sql`AND c.owner_id = ${ownerId}` : Prisma.empty}
    ORDER BY f.scheduled_at ASC
    LIMIT 300`;
  return rows.map((r) => ({
    id: r.id,
    personId: r.person_id,
    ref: r.ref,
    firstName: r.first_name,
    lastName: r.last_name,
    kind: r.kind,
    scheduledAt: r.scheduled_at,
    bucket: followUpBucket(r.scheduled_at, day),
    owner: r.owner,
  }));
}

export interface BoardMentorship {
  id: string;
  menteeId: string;
  menteeRef: string;
  mentee: string;
  mentorRef: string;
  mentor: string;
  startDate: Date;
  lastFollowUpAt: Date | null;
  /** Suggested end after NEW_VOLUNTEER_MONTHS months (never imposed). */
  endSuggested: boolean;
}

/** Ongoing mentorships whose mentee the actor may follow (`mentorship.manage`). */
export async function mentorshipBoard(
  db: DbOrTx,
  actor: Actor,
  day: Date = toParisDay(),
): Promise<BoardMentorship[]> {
  if (!canSome(actor, "mentorship.manage")) authorize(actor, "mentorship.manage");
  const ctx = { day, newVolunteerMonths: await newVolunteerMonths(db) };
  const visible = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM persons p WHERE ${visibleSql(actor, "mentorship.manage", ctx)}`;
  const { newVolunteerMonths: months } = await numericSettings(db);
  const rows = await db.mentorship.findMany({
    where: {
      menteeId: { in: visible.map((v) => v.id) },
      startDate: { lte: day },
      OR: [{ endDate: null }, { endDate: { gte: day } }],
    },
    orderBy: { startDate: "asc" },
    include: {
      mentee: {
        select: {
          ref: true,
          firstName: true,
          lastName: true,
          followUps: {
            where: { doneAt: { not: null } },
            orderBy: { doneAt: "desc" },
            take: 1,
            select: { doneAt: true },
          },
        },
      },
      mentor: { select: { ref: true, firstName: true, lastName: true } },
    },
  });
  return rows.map((m) => ({
    id: m.id,
    menteeId: m.menteeId,
    menteeRef: m.mentee.ref,
    mentee: `${m.mentee.firstName} ${m.mentee.lastName}`,
    mentorRef: m.mentor.ref,
    mentor: `${m.mentor.firstName} ${m.mentor.lastName}`,
    startDate: m.startDate,
    lastFollowUpAt: m.mentee.followUps[0]?.doneAt ?? null,
    endSuggested: mentorshipEndSuggested(m.startDate, months, day),
  }));
}

/** Person of a follow-up (resource of the actions). */
export async function followUpPerson(db: DbOrTx, followUpId: string): Promise<string | null> {
  const row = await db.followUp.findUnique({
    where: { id: followUpId },
    select: { personId: true },
  });
  return row?.personId ?? null;
}
