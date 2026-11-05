import type { Perimeter, Profile, ReminderTrigger } from "@/generated/prisma/enums";
import type { PolicyAction } from "@/lib/actions";
import { formatDate } from "@/lib/dates";
import { loadActor } from "../auth/loadActor";
import type { DbOrTx } from "../db";
import { signedDossierPersonIds } from "../dossier/store";
import { ALERT_TOPIC_ACTION, trainingConcernsProfile } from "../policy/alerts";
import { can } from "../policy/can";
import { loadPersonFactsMany } from "../policy/facts";
import type { Actor } from "../policy/types";
import { trainingState } from "../qualification";
import { alertSensitiveFacts } from "../sensitive";
import { b3Due } from "../statusRules";

/**
 * Reminder engine (step 12): active `ReminderRule`s → dated `Notification`s
 * (the bell). Run by the daily task. Never twice the same notification: the
 * `dedupeKey` is stable (rule + object + due date) and `(user, dedupeKey)` is
 * unique in the database. A recipient only receives a reminder about a person
 * the policy lets them see for that subject.
 */

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

/** One reminder to deliver, before recipients are resolved. */
export interface ReminderItem {
  personId: string | null;
  title: string;
  body: string | null;
  href: string;
  /** Stable key: rule + object + due date. */
  dedupeKey: string;
  /** Action checked on the person for each recipient (none for a person-less reminder). */
  action: PolicyAction | null;
  /** For training reminders: the item's perimeters (ACTION, LASER, FORMAT GP by perimeter). */
  referencePerimeters?: readonly Perimeter[];
}

export interface RuleRow {
  id: string;
  key: string;
  trigger: ReminderTrigger;
  offsetDays: number;
  recipients: Profile[];
}

/** Last day an activity counts for « sans activité » (session, appointment, follow-up). */
export function lastActivity(dates: readonly (Date | null)[]): Date | null {
  let last: Date | null = null;
  for (const d of dates) if (d && (last === null || d.getTime() > last.getTime())) last = d;
  return last;
}

/** Whether the rule fires on `day` for a calendar rule (B3 in January, greetings on 31/12). */
export function calendarRuleDue(trigger: ReminderTrigger, day: Date): boolean {
  if (trigger === "B3_ANNUAL") return day.getUTCMonth() === 0;
  if (trigger === "GREETINGS_REVIEW") return day.getUTCMonth() === 11 && day.getUTCDate() === 31;
  return true;
}

const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

async function itemsOf(db: DbOrTx, rule: RuleRow, day: Date): Promise<ReminderItem[]> {
  const offset = rule.offsetDays;
  switch (rule.trigger) {
    case "CANDIDACY_IDLE": {
      const rows = await db.candidacy.findMany({
        where: { closedAt: null, person: { archivedAt: null } },
        select: {
          id: true,
          updatedAt: true,
          person: { select: { id: true, ref: true, firstName: true, lastName: true } },
          events: { orderBy: { at: "desc" }, take: 1, select: { at: true } },
        },
      });
      return rows.flatMap((c) => {
        const last = lastActivity([c.updatedAt, c.events[0]?.at ?? null]) ?? c.updatedAt;
        const lastDay = new Date(`${iso(last)}T00:00:00.000Z`);
        if (addDays(lastDay, offset).getTime() > day.getTime()) return [];
        return [
          {
            personId: c.person.id,
            title: `${name(c.person)} : candidature sans action`,
            body: `Dernière action le ${formatDate(lastDay)}.`,
            href: `/benevoles/${c.person.ref}?onglet=integration`,
            dedupeKey: `${rule.key}:${c.id}:${iso(lastDay)}`,
            action: ALERT_TOPIC_ACTION.integration,
          },
        ];
      });
    }
    case "DOSSIER_UNSIGNED": {
      const links = await dossierLinksUnsigned(db, day, offset);
      return links.map((l) => ({
        personId: l.person.id,
        title: `${name(l.person)} : dossier envoyé, non signé`,
        body: `Lien envoyé le ${formatDate(l.createdAt)}.`,
        href: `/benevoles/${l.person.ref}?onglet=integration`,
        dedupeKey: `${rule.key}:${l.id}`,
        action: ALERT_TOPIC_ACTION.integration,
      }));
    }
    case "TRAINING_EXPIRING": {
      const records = await db.trainingRecord.findMany({
        where: {
          cancelledAt: null,
          person: { archivedAt: null, status: { in: ["ACTIVE", "PAUSED", "SUSPENDED"] } },
          reference: { kind: "TRAINING" },
        },
        select: {
          personId: true,
          referenceId: true,
          result: true,
          date: true,
          expiresAt: true,
          cancelledAt: true,
          session: { select: { startDate: true } },
          person: { select: { ref: true, firstName: true, lastName: true } },
          reference: { select: { code: true, perimeters: true } },
        },
      });
      const groups = new Map<string, typeof records>();
      for (const r of records) {
        const key = `${r.personId}:${r.referenceId}`;
        groups.set(key, [...(groups.get(key) ?? []), r]);
      }
      const items: ReminderItem[] = [];
      for (const group of groups.values()) {
        const first = group[0];
        if (!first) continue;
        const state = trainingState(
          group.map((r) => ({ ...r, sessionStart: r.session?.startDate ?? null })),
          day,
          offset,
        );
        if (state.status !== "EXPIRING" || !state.expiresAt) continue;
        items.push({
          personId: first.personId,
          title: `${name(first.person)} : ${first.reference.code} arrive à échéance`,
          body: `Échéance le ${formatDate(state.expiresAt)}.`,
          href: `/benevoles/${first.person.ref}?onglet=formations`,
          dedupeKey: `${rule.key}:${first.personId}:${first.referenceId}:${iso(state.expiresAt)}`,
          action: ALERT_TOPIC_ACTION.training,
          referencePerimeters: first.reference.perimeters,
        });
      }
      return items;
    }
    case "FOLLOWUP_DUE": {
      const rows = await db.followUp.findMany({
        where: {
          doneAt: null,
          cancelledAt: null,
          scheduledAt: { lte: addDays(day, offset) },
          person: { archivedAt: null, status: { in: ["ACTIVE", "PAUSED"] } },
        },
        select: {
          id: true,
          kind: true,
          scheduledAt: true,
          person: { select: { id: true, ref: true, firstName: true, lastName: true } },
        },
      });
      return rows.map((f) => ({
        personId: f.person.id,
        title: `${name(f.person)} : point de suivi à faire`,
        body: f.scheduledAt ? `Prévu le ${formatDate(f.scheduledAt)}.` : null,
        href: `/benevoles/${f.person.ref}?onglet=suivi`,
        dedupeKey: `${rule.key}:${f.id}`,
        action: ALERT_TOPIC_ACTION.integration,
      }));
    }
    case "PERSON_INACTIVE": {
      const since = addDays(day, -offset);
      const rows = await db.person.findMany({
        where: {
          archivedAt: null,
          status: "ACTIVE",
          OR: [{ entryDate: null }, { entryDate: { lte: since } }],
        },
        select: {
          id: true,
          ref: true,
          firstName: true,
          lastName: true,
          trainingRecords: {
            where: { cancelledAt: null },
            select: { date: true, session: { select: { startDate: true } } },
          },
          appointments: { where: { cancelledAt: null }, select: { startDate: true } },
          followUps: { where: { doneAt: { not: null } }, select: { doneAt: true } },
        },
      });
      return rows.flatMap((p) => {
        const last = lastActivity([
          ...p.trainingRecords.map((r) => r.session?.startDate ?? r.date),
          ...p.appointments.map((a) => a.startDate),
          ...p.followUps.map((f) => f.doneAt),
        ]);
        if (last && last.getTime() > since.getTime()) return [];
        return [
          {
            personId: p.id,
            title: `${name(p)} : sans activité depuis 6 mois`,
            body: last ? `Dernière activité le ${formatDate(last)}.` : "Aucune activité connue.",
            href: `/benevoles/${p.ref}`,
            dedupeKey: `${rule.key}:${p.id}:${last ? iso(last) : "none"}`,
            action: "person.full.read" as const,
          },
        ];
      });
    }
    case "B3_ANNUAL": {
      const rows = await db.person.findMany({
        where: {
          archivedAt: null,
          regularMinorSupervisor: true,
          status: { in: ["ACTIVE", "PAUSED"] },
        },
        select: {
          id: true,
          ref: true,
          firstName: true,
          lastName: true,
        },
      });
      const checks = await alertSensitiveFacts(
        db,
        rows.map((p) => p.id),
        day,
      );
      return rows
        .filter((p) => b3Due(checks.get(p.id)?.b3CheckedAt ?? null, day))
        .map((p) => ({
          personId: p.id,
          title: `${name(p)} : B3 à vérifier cette année`,
          body: null,
          href: `/benevoles/${p.ref}?onglet=suivi`,
          dedupeKey: `${rule.key}:${p.id}:${String(day.getUTCFullYear())}`,
          action: ALERT_TOPIC_ACTION.admin,
        }));
    }
    case "PAUSE_RETURN": {
      const rows = await db.person.findMany({
        where: { archivedAt: null, status: "PAUSED", pauseUntil: { lte: addDays(day, offset) } },
        select: { id: true, ref: true, firstName: true, lastName: true, pauseUntil: true },
      });
      return rows.map((p) => ({
        personId: p.id,
        title: `${name(p)} : reprise de pause`,
        body: p.pauseUntil ? `Reprise prévue le ${formatDate(p.pauseUntil)}.` : null,
        href: `/benevoles/${p.ref}`,
        dedupeKey: `${rule.key}:${p.id}:${p.pauseUntil ? iso(p.pauseUntil) : ""}`,
        action: ALERT_TOPIC_ACTION.integration,
      }));
    }
    case "GREETINGS_REVIEW":
      return [
        {
          personId: null,
          title: "Relire les textes d'anniversaire",
          body: "Les e-mails d'anniversaire et d'engagement de l'année prochaine partent avec ces textes.",
          href: "/admin/reglages",
          dedupeKey: `${rule.key}:${String(day.getUTCFullYear())}`,
          action: null,
        },
      ];
  }
}

/** Remote dossier links sent at least `offset` days ago, still unsigned (candidate). */
export async function dossierLinksUnsigned(db: DbOrTx, day: Date, offset: number) {
  const links = await db.dossierLink.findMany({
    where: {
      mode: "REMOTE",
      revokedAt: null,
      createdAt: { lte: addDays(day, -offset) },
      person: { status: "CANDIDATE", archivedAt: null },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      person: {
        select: {
          id: true,
          ref: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });
  // The latest link of each person only, and never once she has signed.
  const signed = await signedDossierPersonIds(
    db,
    links.map((l) => l.person.id),
  );
  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.person.id)) return false;
    seen.add(l.person.id);
    return !signed.has(l.person.id);
  });
}

/** Whether `actor` receives `item` of a rule addressed to `recipients`. */
export function receives(
  actor: Actor,
  recipients: readonly Profile[],
  item: ReminderItem,
  facts: Parameters<typeof can>[2],
): boolean {
  const profiles = recipients.filter((p) => actor.profiles.has(p));
  if (profiles.length === 0) return false;
  if (
    item.referencePerimeters &&
    !profiles.some((p) => trainingConcernsProfile(p, item.referencePerimeters ?? []))
  ) {
    return false;
  }
  if (item.action === null) return true;
  return can(actor, item.action, facts).allowed;
}

/**
 * Runs every active rule for `day` and writes the new notifications.
 * Returns the number created (duplicates are skipped by the unique key).
 */
export async function runReminders(db: DbOrTx, day: Date): Promise<number> {
  const rules = await db.reminderRule.findMany({
    where: { active: true, channels: { has: "IN_APP" } },
    select: { id: true, key: true, trigger: true, offsetDays: true, recipients: true },
  });
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  const actors = (await Promise.all(users.map((u) => loadActor(db, u.id)))).filter(
    (a): a is Actor => a !== null,
  );
  let created = 0;
  for (const rule of rules) {
    if (!calendarRuleDue(rule.trigger, day)) continue;
    const items = await itemsOf(db, rule, day);
    const personIds = [...new Set(items.flatMap((i) => (i.personId ? [i.personId] : [])))];
    const facts = await loadPersonFactsMany(db, personIds, day);
    const data = [];
    for (const item of items) {
      const person = item.personId ? facts.get(item.personId) : undefined;
      if (item.personId && !person) continue;
      for (const actor of actors) {
        if (!receives(actor, rule.recipients, item, person ? { person } : {})) continue;
        data.push({
          userId: actor.userId,
          ruleId: rule.id,
          personId: item.personId,
          title: item.title,
          body: item.body,
          href: item.href,
          dedupeKey: item.dedupeKey,
        });
      }
    }
    if (data.length > 0) {
      const result = await db.notification.createMany({ data, skipDuplicates: true });
      created += result.count;
    }
  }
  return created;
}
