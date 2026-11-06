import { createHash } from "node:crypto";
import { toParisDay } from "@/lib/dates";
import { automationSettings } from "../automationSettings";
import type { DbOrTx } from "../db";
import { DomainError } from "../errors";
import { urgenceNoticeMail, urgenceSummaryMail } from "../mail/automatedTexts";
import { authorize } from "../policy/can";
import { newVolunteerMonths } from "../policy/facts";
import type { Actor } from "../policy/types";
import { visibleSql } from "../policy/visibility";
import { QUALIFICATION_LABELS, trainingState } from "../qualification";
import { numericSettings } from "../settings";
import { sendAutomated, type SendOutcome } from "./automation";

/**
 * Prévenance du pôle Urgence (step 12): an e-mail as soon as a session of a
 * listed training (`URGENCE_NOTIFY_CODES`, TCAU by default) is validated or
 * registered, **one e-mail per group entry**, to `URGENCE_NOTIFY_RECIPIENTS`
 * (empty by default: nothing leaves). Called **after** the transaction: the
 * entry is kept whatever happens to the e-mail; a failure is recorded.
 */

export type UrgenceOutcome = SendOutcome | "NOT_LISTED" | "NO_RECIPIENT";

export async function notifyUrgence(
  db: DbOrTx,
  actor: Actor,
  input: {
    reference: { code: string; label: string };
    result: string;
    date: Date | null;
    recordIds: readonly string[];
  },
): Promise<UrgenceOutcome> {
  if (input.result !== "PASSED" && input.result !== "REGISTERED") return "NOT_LISTED";
  const settings = await automationSettings(db);
  if (!settings.urgenceNotifyCodes.includes(input.reference.code)) return "NOT_LISTED";
  if (settings.urgenceNotifyRecipients.length === 0) return "NO_RECIPIENT";
  const records = await db.trainingRecord.findMany({
    where: { id: { in: [...input.recordIds] } },
    select: { person: { select: { firstName: true, lastName: true } } },
  });
  const people = records
    .map((r) => `${r.person.firstName} ${r.person.lastName}`)
    .sort((a, b) => a.localeCompare(b, "fr"));
  const text = urgenceNoticeMail({
    code: input.reference.code,
    label: input.reference.label,
    result: input.result,
    date: input.date,
    people,
    author: actor.name,
  });
  const key = createHash("sha256")
    .update([...input.recordIds].sort().join(","))
    .update(input.result)
    .digest("hex")
    .slice(0, 32);
  try {
    return await sendAutomated(db, {
      dedupeKey: `URGENCE_NOTICE:${key}`,
      kind: "URGENCE_NOTICE",
      messages: settings.urgenceNotifyRecipients.map((to) => ({ to, ...text })),
    });
  } catch {
    // Even the record of the failure failed: the entry itself is already saved.
    return "FAILED";
  }
}

/**
 * « Récapitulatif TCAU »: the state of the listed trainings for every present
 * volunteer the sender may see (`training.read`), to the Urgence recipients.
 */
export async function sendUrgenceSummary(
  db: DbOrTx,
  actor: Actor,
  now: Date = new Date(),
): Promise<{ outcome: SendOutcome; people: number }> {
  authorize(actor, "trainingSession.manage");
  const settings = await automationSettings(db);
  if (settings.urgenceNotifyRecipients.length === 0) {
    throw new DomainError(
      "INVALID_DATA",
      "Aucun destinataire du pôle Urgence n'est réglé (Réglages, prévenance Urgence).",
    );
  }
  const day = toParisDay(now);
  const ctx = { day, newVolunteerMonths: await newVolunteerMonths(db) };
  const visible = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM persons p
    WHERE ${visibleSql(actor, "training.read", ctx)}
      AND p.archived_at IS NULL
      AND p.status IN ('ACTIVE'::"PersonStatus", 'PAUSED'::"PersonStatus")`;
  const ids = visible.map((v) => v.id);
  const [people, records, { alertDays }] = await Promise.all([
    db.person.findMany({
      where: { id: { in: ids } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    db.trainingRecord.findMany({
      where: {
        personId: { in: ids },
        cancelledAt: null,
        reference: { code: { in: settings.urgenceNotifyCodes } },
      },
      select: {
        personId: true,
        result: true,
        date: true,
        expiresAt: true,
        cancelledAt: true,
        session: { select: { startDate: true } },
        reference: { select: { code: true } },
      },
    }),
    numericSettings(db),
  ]);
  const rows = people.map((p) => ({
    name: `${p.firstName} ${p.lastName}`,
    states: settings.urgenceNotifyCodes.map((code) => {
      const mine = records
        .filter((r) => r.personId === p.id && r.reference.code === code)
        .map((r) => ({ ...r, sessionStart: r.session?.startDate ?? null }));
      return `${code} ${QUALIFICATION_LABELS[trainingState(mine, day, alertDays).status].toLowerCase()}`;
    }),
  }));
  const text = urgenceSummaryMail({
    codes: settings.urgenceNotifyCodes,
    rows,
    author: actor.name,
    day,
  });
  const outcome = await sendAutomated(db, {
    dedupeKey: `URGENCE_SUMMARY:${actor.userId}:${now.toISOString()}`,
    kind: "URGENCE_SUMMARY",
    messages: settings.urgenceNotifyRecipients.map((to) => ({ to, ...text })),
  });
  return { outcome, people: rows.length };
}
