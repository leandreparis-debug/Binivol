import { toParisDay } from "@/lib/dates";
import type { DbOrTx } from "../db";
import { computePerimeters, perimetersOf } from "../perimeter";
import { addMonthsUtc } from "../reference";
import type { FunctionFacts, PersonFacts } from "./types";

export const DEFAULT_NEW_VOLUNTEER_MONTHS = 12;

/** Reads `NEW_VOLUNTEER_MONTHS` from `settings` (default 12). */
export async function newVolunteerMonths(db: DbOrTx): Promise<number> {
  const setting = await db.setting.findUnique({ where: { key: "NEW_VOLUNTEER_MONTHS" } });
  const value = setting?.value;
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : DEFAULT_NEW_VOLUNTEER_MONTHS;
}

/**
 * Facts the policy needs about a person, read from the database.
 * Returns null when the person does not exist.
 *
 * DIAMANT scope: status CANDIDATE, or an open candidacy, or an entry date less
 * than NEW_VOLUNTEER_MONTHS months ago, or a current mentorship as mentee.
 */
export async function loadPersonFacts(
  db: DbOrTx,
  personId: string,
  day: Date = toParisDay(),
): Promise<PersonFacts | null> {
  const person = await db.person.findUnique({
    where: { id: personId },
    select: { id: true, status: true, archivedAt: true, entryDate: true },
  });
  if (!person) return null;

  const [perimeters, months, openCandidacy, currentMentorship] = await Promise.all([
    perimetersOf(db, personId, day),
    newVolunteerMonths(db),
    db.candidacy.count({ where: { personId, closedAt: null } }),
    db.mentorship.count({
      where: {
        menteeId: personId,
        startDate: { lte: day },
        OR: [{ endDate: null }, { endDate: { gte: day } }],
      },
    }),
  ]);
  const newcomer =
    person.entryDate !== null && person.entryDate.getTime() > addMonthsUtc(day, -months).getTime();

  return {
    personId: person.id,
    status: person.status,
    perimeters,
    inDiamantScope:
      person.status === "CANDIDATE" || openCandidacy > 0 || newcomer || currentMentorship > 0,
    archived: person.archivedAt !== null,
  };
}

/**
 * Batch version of `loadPersonFacts` for lists: a fixed number of queries
 * whatever the number of people (no N+1). Missing ids are absent from the map.
 */
export async function loadPersonFactsMany(
  db: DbOrTx,
  personIds: readonly string[],
  day: Date = toParisDay(),
  months?: number,
): Promise<Map<string, PersonFacts>> {
  const ids = [...new Set(personIds)];
  const result = new Map<string, PersonFacts>();
  if (ids.length === 0) return result;
  const withPerimeters = { perimeters: { isEmpty: false } };
  const [persons, records, appointments, candidacies, mentorships, windowMonths] =
    await Promise.all([
      db.person.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, archivedAt: true, entryDate: true, isTrainer: true },
      }),
      db.trainingRecord.findMany({
        where: {
          personId: { in: ids },
          result: "PASSED",
          cancelledAt: null,
          reference: withPerimeters,
        },
        select: {
          personId: true,
          result: true,
          expiresAt: true,
          cancelledAt: true,
          reference: { select: { perimeters: true } },
        },
      }),
      db.appointment.findMany({
        where: { personId: { in: ids }, cancelledAt: null, reference: withPerimeters },
        select: {
          personId: true,
          startDate: true,
          endDate: true,
          cancelledAt: true,
          reference: { select: { perimeters: true } },
        },
      }),
      db.candidacy.findMany({
        where: { personId: { in: ids }, closedAt: null },
        select: { personId: true },
      }),
      db.mentorship.findMany({
        where: {
          menteeId: { in: ids },
          startDate: { lte: day },
          OR: [{ endDate: null }, { endDate: { gte: day } }],
        },
        select: { menteeId: true },
      }),
      months === undefined ? newVolunteerMonths(db) : Promise.resolve(months),
    ]);
  const openCandidacy = new Set(candidacies.map((c) => c.personId));
  const mentee = new Set(mentorships.map((m) => m.menteeId));
  const since = addMonthsUtc(day, -windowMonths).getTime();
  for (const person of persons) {
    const perimeters = computePerimeters(
      {
        records: records
          .filter((r) => r.personId === person.id)
          .map((r) => ({ ...r, perimeters: r.reference.perimeters })),
        appointments: appointments
          .filter((a) => a.personId === person.id)
          .map((a) => ({ ...a, perimeters: a.reference.perimeters })),
        isTrainer: person.isTrainer,
      },
      day,
    );
    const newcomer = person.entryDate !== null && person.entryDate.getTime() > since;
    result.set(person.id, {
      personId: person.id,
      status: person.status,
      perimeters,
      inDiamantScope:
        person.status === "CANDIDATE" ||
        openCandidacy.has(person.id) ||
        newcomer ||
        mentee.has(person.id),
      archived: person.archivedAt !== null,
    });
  }
  return result;
}

/** Facts about a function of the reference list (appointment rights). */
export async function loadFunctionFacts(
  db: DbOrTx,
  referenceId: string,
): Promise<FunctionFacts | null> {
  const item = await db.referenceItem.findUnique({
    where: { id: referenceId },
    select: { code: true, kind: true, managedBy: true },
  });
  if (item?.kind !== "FUNCTION") return null;
  return { code: item.code, managedBy: item.managedBy };
}
