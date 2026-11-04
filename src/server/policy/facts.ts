import { toParisDay } from "@/lib/dates";
import type { DbOrTx } from "../db";
import { perimetersOf } from "../perimeter";
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
