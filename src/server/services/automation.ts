import type { AutomatedMessageKind, AutomatedMessageStatus } from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { alertsFor } from "../alerts/load";
import { ALERT_PRIORITY_LABELS, ALERT_PRIORITIES, ALERT_RULES } from "../alerts/rules";
import { loadActor } from "../auth/loadActor";
import { anniversaryOn, digestDue, engagementYears } from "../automationRules";
import { automationSettings } from "../automationSettings";
import type { Db, DbOrTx } from "../db";
import { getMail, MailUnavailableError, type MailMessage } from "../mail";
import {
  anniversaryMail,
  birthdayMail,
  digestMail,
  dossierReminderMail,
} from "../mail/automatedTexts";
import { dossierLinksUnsigned, runReminders } from "../reminders/engine";
import { birthdaysOn } from "../sensitive";
import { dossierSettings } from "../settings";

/**
 * Automatic e-mails and the daily task (step 12, docs/taches.md). Every
 * e-mail goes through `MailService`; each one carries a stable `dedupeKey`
 * and is never sent twice. A failure is recorded (no address, no content)
 * and shown to TOPAZE; it never undoes what was saved before.
 */

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type SendOutcome = AutomatedMessageStatus | "DUPLICATE";

/** Sends `messages` once for `dedupeKey` (a FAILED one is tried again). */
export async function sendAutomated(
  db: DbOrTx,
  input: {
    dedupeKey: string;
    kind: AutomatedMessageKind;
    personId?: string | null;
    messages: MailMessage[];
  },
): Promise<SendOutcome> {
  const existing = await db.automatedMessage.findUnique({ where: { dedupeKey: input.dedupeKey } });
  if (existing && existing.status !== "FAILED") return "DUPLICATE";
  let status: AutomatedMessageStatus = "SKIPPED";
  let error: string | null = null;
  if (input.messages.length > 0) {
    try {
      const mail = getMail(db);
      for (const message of input.messages) await mail.send(message);
      status = "SENT";
    } catch (cause) {
      status = "FAILED";
      error =
        cause instanceof MailUnavailableError
          ? "Relais de messagerie indisponible."
          : "Envoi impossible.";
    }
  }
  await db.automatedMessage.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      dedupeKey: input.dedupeKey,
      kind: input.kind,
      status,
      personId: input.personId ?? null,
      recipients: input.messages.length,
      error,
    },
    update: { status, recipients: input.messages.length, error },
  });
  return status;
}

function appUrl(): string {
  const env = getEnv();
  const configured = env.APP_URL ?? env.AUTH_URL;
  return configured ? new URL(configured).origin : "";
}

/** Alert digest of every active responsible, when due (1st of the month or Monday). */
export async function runDigest(db: DbOrTx, day: Date): Promise<number> {
  const { digestFrequency } = await automationSettings(db);
  if (!digestDue(digestFrequency, day)) return 0;
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  let sent = 0;
  for (const u of users) {
    const actor = await loadActor(db, u.id);
    if (!actor) continue;
    // Alerts the recipient may see, and only those (visibility of each topic).
    const alerts = await alertsFor(db, actor, { day });
    if (alerts.length === 0) continue;
    const text = digestMail({
      name: actor.name,
      total: alerts.length,
      counts: ALERT_PRIORITIES.map((p) => ({
        label: ALERT_PRIORITY_LABELS[p],
        count: alerts.filter((a) => a.priority === p).length,
      })).filter((c) => c.count > 0),
      lines: alerts.slice(0, 40).map((a) => ({
        priority: ALERT_PRIORITY_LABELS[a.priority],
        subject: a.subject,
        label: ALERT_RULES[a.code].label,
        message: a.message,
      })),
      appUrl: appUrl(),
    });
    const outcome = await sendAutomated(db, {
      dedupeKey: `DIGEST:${actor.userId}:${iso(day)}`,
      kind: "DIGEST",
      messages: [{ to: actor.email, ...text }],
    });
    if (outcome === "SENT") sent += 1;
  }
  return sent;
}

/**
 * Birthday and engagement anniversary e-mails (disabled by default). Never
 * twice the same day to the same person (one key per person and day), never
 * the age, never to someone who opted out.
 */
export async function runGreetings(db: DbOrTx, day: Date): Promise<number> {
  const settings = await automationSettings(db);
  if (!settings.greetingEmailsEnabled) return 0;
  const people = await db.person.findMany({
    where: {
      archivedAt: null,
      status: { in: ["ACTIVE", "PAUSED"] },
      greetingOptOut: false,
      email: { not: null },
    },
    select: { id: true, firstName: true, email: true, entryDate: true },
  });
  const { ulName } = await dossierSettings(db);
  const birthdays = new Set(
    await birthdaysOn(
      db,
      people.map((p) => p.id),
      day,
    ),
  );
  let sent = 0;
  for (const p of people) {
    if (!p.email) continue;
    let text = null;
    let kind: AutomatedMessageKind = "BIRTHDAY";
    if (birthdays.has(p.id)) {
      text = birthdayMail({ firstName: p.firstName, template: settings.birthdayText, ulName });
    } else if (p.entryDate && anniversaryOn(p.entryDate, day)) {
      const years = engagementYears(p.entryDate, day);
      if (years < 1) continue;
      kind = "ENGAGEMENT_ANNIVERSARY";
      text = anniversaryMail({
        firstName: p.firstName,
        years,
        template: settings.anniversaryText,
        ulName,
      });
    }
    if (!text) continue;
    const outcome = await sendAutomated(db, {
      dedupeKey: `GREETING:${p.id}:${iso(day)}`,
      kind,
      personId: p.id,
      messages: [{ to: p.email, ...text }],
    });
    if (outcome === "SENT") sent += 1;
  }
  return sent;
}

/** « Dossier non signé »: the candidate receives one reminder per link (without the link). */
export async function runDossierReminders(db: DbOrTx, day: Date): Promise<number> {
  const rule = await db.reminderRule.findUnique({ where: { key: "DOSSIER_UNSIGNED" } });
  if (!rule?.active) return 0;
  const { ulName } = await dossierSettings(db);
  const links = await dossierLinksUnsigned(db, day, rule.offsetDays);
  let sent = 0;
  for (const link of links) {
    if (!link.person.email) continue;
    const text = dossierReminderMail({
      firstName: link.person.firstName,
      ulName,
      sentAt: link.createdAt,
    });
    const outcome = await sendAutomated(db, {
      dedupeKey: `DOSSIER_REMINDER:${link.id}`,
      kind: "DOSSIER_REMINDER",
      personId: link.person.id,
      messages: [{ to: link.person.email, ...text }],
    });
    if (outcome === "SENT") sent += 1;
  }
  return sent;
}

export const DAILY_JOB = "daily";

export interface DailyResult {
  status: "done" | "already";
  day: string;
  notifications?: number;
  dossierReminders?: number;
  digests?: number;
  greetings?: number;
}

/**
 * The daily task: reminders, dossier reminders, digests, greetings. A lock
 * in `job_runs` (one row per job and day) makes it idempotent: run twice the
 * same day, the second run does nothing. A failed run may be run again (each
 * step is idempotent by itself).
 */
export async function runDailyTask(db: Db, now: Date = new Date()): Promise<DailyResult> {
  const day = toParisDay(now);
  const existing = await db.jobRun.findUnique({ where: { job_day: { job: DAILY_JOB, day } } });
  if (existing && existing.status !== "FAILED") return { status: "already", day: iso(day) };
  // Claim the day: the unique (job, day) refuses a concurrent run.
  const claimed = existing
    ? await db.jobRun.updateMany({
        where: { id: existing.id, status: "FAILED" },
        data: { status: "RUNNING", startedAt: new Date(), error: null },
      })
    : await db.jobRun
        .create({ data: { job: DAILY_JOB, day } })
        .then(() => ({ count: 1 }))
        .catch(() => ({ count: 0 }));
  if (claimed.count === 0) return { status: "already", day: iso(day) };
  try {
    const notifications = await runReminders(db, day);
    const dossierReminders = await runDossierReminders(db, day);
    const digests = await runDigest(db, day);
    const greetings = await runGreetings(db, day);
    const summary = { notifications, dossierReminders, digests, greetings };
    await db.jobRun.update({
      where: { job_day: { job: DAILY_JOB, day } },
      data: { status: "DONE", finishedAt: new Date(), summary },
    });
    return { status: "done", day: iso(day), ...summary };
  } catch (cause) {
    await db.jobRun.update({
      where: { job_day: { job: DAILY_JOB, day } },
      data: {
        status: "FAILED",
        finishedAt: new Date(),
        error: cause instanceof Error ? cause.name : "Erreur",
      },
    });
    throw cause;
  }
}
