import { Prisma } from "@/generated/prisma/client";
import { toParisDay } from "@/lib/dates";
import { automationSettings } from "../automationSettings";
import type { DbOrTx } from "../db";
import { ALERT_TOPIC_ACTION, type AlertTopic } from "../policy/alerts";
import { can, canSome } from "../policy/can";
import type { Actor } from "../policy/types";
import { visibleSql, type VisibilityContext } from "../policy/visibility";
import { alertSensitiveFacts } from "../sensitive";
import { numericSettings } from "../settings";
import {
  personAlerts,
  referenceAlerts,
  sortAlerts,
  type Alert,
  type AlertConfig,
  type AlertPerson,
  type AlertReference,
} from "./rules";

/**
 * Alert engine, loading part (step 12). Everything is loaded in a fixed number
 * of grouped queries (no N+1), then evaluated by the pure rules. Visibility:
 * an alert is kept when its topic's action (`policy/alerts.ts`) is allowed on
 * the person, decided **in SQL** by `visibleSql()`.
 */

export interface LoadedAlert extends Alert {
  /** Owner of the person's latest candidacy (« responsable » filter). */
  ownerId: string | null;
}

const PERSON_TOPICS: readonly Exclude<AlertTopic, "reference">[] = [
  "training",
  "integration",
  "admin",
];

async function alertConfig(db: DbOrTx, day: Date): Promise<AlertConfig> {
  const [numeric, auto] = await Promise.all([numericSettings(db), automationSettings(db)]);
  return {
    day,
    alertDays: numeric.alertDays,
    coreCodes: auto.coreTrainingCodes,
    companions: auto.requiredCompanions,
    disabled: new Set(auto.alertRulesDisabled),
  };
}

/** The whole reference list, with prerequisites, by id. */
export async function loadAlertReferences(db: DbOrTx): Promise<Map<string, AlertReference>> {
  const items = await db.referenceItem.findMany({
    select: {
      id: true,
      code: true,
      label: true,
      kind: true,
      active: true,
      forbiddenForMinors: true,
      validityMonths: true,
      expiresEndOfYear: true,
      prerequisites: { select: { prerequisiteId: true } },
    },
  });
  return new Map(
    items.map((i) => [
      i.id,
      {
        id: i.id,
        code: i.code,
        label: i.label,
        kind: i.kind,
        active: i.active,
        forbiddenForMinors: i.forbiddenForMinors,
        validityMonths: i.validityMonths,
        expiresEndOfYear: i.expiresEndOfYear,
        prerequisiteIds: i.prerequisites.map((p) => p.prerequisiteId),
      },
    ]),
  );
}

/** Snapshots of the given people, in seven grouped queries. */
export async function loadAlertPeople(
  db: DbOrTx,
  ids: readonly string[],
  day: Date,
): Promise<{ people: AlertPerson[]; owners: Map<string, string | null> }> {
  if (ids.length === 0) return { people: [], owners: new Map() };
  const list = [...ids];
  const [persons, records, appointments, candidacies, followUps, sensitive] = await Promise.all([
    db.person.findMany({
      where: { id: { in: list } },
      select: {
        id: true,
        ref: true,
        firstName: true,
        lastName: true,
        status: true,
        nivol: true,
        email: true,
        regularMinorSupervisor: true,
        purgeEligibleAt: true,
        pauseUntil: true,
      },
    }),
    db.trainingRecord.findMany({
      where: { personId: { in: list }, cancelledAt: null },
      select: {
        personId: true,
        referenceId: true,
        result: true,
        date: true,
        expiresAt: true,
        session: { select: { startDate: true } },
      },
    }),
    db.appointment.findMany({
      where: { personId: { in: list }, cancelledAt: null },
      select: { personId: true, referenceId: true, startDate: true, endDate: true },
    }),
    db.candidacy.findMany({
      where: { personId: { in: list } },
      orderBy: { createdAt: "desc" },
      select: { personId: true, ownerId: true, closedAt: true, followUpAt: true },
    }),
    db.followUp.findMany({
      where: {
        personId: { in: list },
        doneAt: null,
        cancelledAt: null,
        scheduledAt: { not: null },
      },
      select: { personId: true, scheduledAt: true },
    }),
    alertSensitiveFacts(db, list, day),
  ]);

  const group = <T extends { personId: string }>(rows: T[]) => {
    const map = new Map<string, T[]>();
    for (const row of rows) {
      const bucket = map.get(row.personId) ?? [];
      bucket.push(row);
      map.set(row.personId, bucket);
    }
    return map;
  };
  const recordsBy = group(records);
  const appointmentsBy = group(appointments);
  const candidaciesBy = group(candidacies);
  const followUpsBy = group(followUps);
  const owners = new Map<string, string | null>();

  const people = persons.map((p): AlertPerson => {
    const facts = sensitive.get(p.id);
    const personCandidacies = candidaciesBy.get(p.id) ?? [];
    owners.set(p.id, personCandidacies[0]?.ownerId ?? null);
    const open = personCandidacies.find((c) => c.closedAt === null);
    return {
      ...p,
      regularMinorSupervisor: p.regularMinorSupervisor === true,
      age: facts?.age ?? null,
      b3CheckedAt: facts?.b3CheckedAt ?? null,
      parentalAuthorization: facts?.parentalAuthorization ?? false,
      records: (recordsBy.get(p.id) ?? []).map((r) => ({
        referenceId: r.referenceId,
        result: r.result,
        date: r.date,
        expiresAt: r.expiresAt,
        cancelledAt: null,
        sessionStart: r.session?.startDate ?? null,
      })),
      appointments: appointmentsBy.get(p.id) ?? [],
      candidacyFollowUpAt: open?.followUpAt ?? null,
      plannedFollowUps: (followUpsBy.get(p.id) ?? []).flatMap((f) =>
        f.scheduledAt ? [f.scheduledAt] : [],
      ),
    };
  });
  return { people, owners };
}

/** People an alert may concern: present ones, and those who left with a passed purge date. */
function concernedSql(day: Date): Prisma.Sql {
  return Prisma.sql`p.archived_at IS NULL AND (
    p.status IN ('CANDIDATE'::"PersonStatus", 'ACTIVE'::"PersonStatus", 'PAUSED'::"PersonStatus", 'SUSPENDED'::"PersonStatus")
    OR (p.status = 'LEFT'::"PersonStatus" AND p.purge_eligible_at <= ${day}::date)
  )`;
}

/** For each person topic the actor may see, the ids of the visible people (SQL). */
async function visibleByTopic(
  db: DbOrTx,
  actor: Actor,
  ctx: VisibilityContext,
  only: readonly string[] | null,
): Promise<Map<AlertTopic, Set<string>>> {
  const result = new Map<AlertTopic, Set<string>>();
  const restrict = only === null ? Prisma.empty : Prisma.sql`AND p.id = ANY(${[...only]}::text[])`;
  for (const topic of PERSON_TOPICS) {
    const action = ALERT_TOPIC_ACTION[topic];
    if (!canSome(actor, action)) continue;
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM persons p
      WHERE ${visibleSql(actor, action, ctx)} AND ${concernedSql(ctx.day)} ${restrict}`;
    result.set(topic, new Set(rows.map((r) => r.id)));
  }
  return result;
}

/**
 * Alerts the actor may see, sorted by priority. `personIds` restricts the
 * computation to some people (directory page, person header) and leaves out
 * the reference list alerts.
 */
export async function alertsFor(
  db: DbOrTx,
  actor: Actor,
  options: { day?: Date; personIds?: readonly string[] } = {},
): Promise<LoadedAlert[]> {
  const day = options.day ?? toParisDay();
  const only = options.personIds ?? null;
  if (only !== null && only.length === 0) return [];
  const [config, numeric] = await Promise.all([alertConfig(db, day), numericSettings(db)]);
  const ctx: VisibilityContext = { day, newVolunteerMonths: numeric.newVolunteerMonths };
  const visible = await visibleByTopic(db, actor, ctx, only);
  const ids = new Set<string>();
  for (const set of visible.values()) for (const id of set) ids.add(id);
  const references = await loadAlertReferences(db);
  const { people, owners } = await loadAlertPeople(db, [...ids], day);

  const alerts: LoadedAlert[] = [];
  for (const person of people) {
    for (const alert of personAlerts(person, references, config)) {
      if (visible.get(alert.topic)?.has(person.id)) {
        alerts.push({ ...alert, ownerId: owners.get(person.id) ?? null });
      }
    }
  }
  if (only === null && can(actor, ALERT_TOPIC_ACTION.reference).allowed) {
    for (const alert of referenceAlerts(references.values(), config)) {
      alerts.push({ ...alert, ownerId: null });
    }
  }
  return sortAlerts(alerts) as LoadedAlert[];
}

/** Number of visible alerts per person (directory badge, person header). */
export async function alertCounts(
  db: DbOrTx,
  actor: Actor,
  personIds: readonly string[],
  day?: Date,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const alerts = await alertsFor(db, actor, { personIds, ...(day ? { day } : {}) });
  for (const a of alerts) {
    if (a.personId) counts.set(a.personId, (counts.get(a.personId) ?? 0) + 1);
  }
  return counts;
}

/** Whether the actor may open /alertes (at least one topic). */
export function canSeeAlerts(actor: Actor): boolean {
  return (
    PERSON_TOPICS.some((t) => canSome(actor, ALERT_TOPIC_ACTION[t])) ||
    can(actor, ALERT_TOPIC_ACTION.reference).allowed
  );
}
