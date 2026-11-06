import type { Prisma } from "@/generated/prisma/client";
import type { Profile } from "@/generated/prisma/enums";
import type { SettingsForm } from "@/lib/settingsForms";
import { withAudit } from "../audit";
import { ALERT_CODES, type AlertCode } from "../alerts/rules";
import {
  AUTOMATION_KEYS,
  automationSettings,
  parseAutomationValue,
  type AutomationKey,
  type AutomationSettings,
} from "../automationSettings";
import type { DbOrTx } from "../db";
import { DomainError } from "../errors";
import { authorize } from "../policy/can";
import type { Actor } from "../policy/types";

/**
 * /admin/reglages (step 12, TOPAZE): alert rules, reminder rules, digest,
 * prévenance Urgence, greetings; the last runs of the daily task and the
 * automatic e-mails that failed. Every change is validated and audited.
 */

const auditActor = (actor: Actor) => ({ userId: actor.userId, label: actor.name });

export interface AutomationOverview {
  settings: AutomationSettings;
  rules: {
    id: string;
    key: string;
    label: string;
    trigger: string;
    offsetDays: number;
    recipients: string[];
    active: boolean;
  }[];
  runs: { day: Date; status: string; finishedAt: Date | null; summary: unknown }[];
  failures: { id: string; kind: string; createdAt: Date; error: string | null }[];
}

export async function automationOverview(db: DbOrTx, actor: Actor): Promise<AutomationOverview> {
  authorize(actor, "setting.manage");
  const [settings, rules, runs, failures] = await Promise.all([
    automationSettings(db),
    db.reminderRule.findMany({
      orderBy: { key: "asc" },
      select: {
        id: true,
        key: true,
        label: true,
        trigger: true,
        offsetDays: true,
        recipients: true,
        active: true,
      },
    }),
    db.jobRun.findMany({
      orderBy: { day: "desc" },
      take: 7,
      select: { day: true, status: true, finishedAt: true, summary: true },
    }),
    db.automatedMessage.findMany({
      where: { status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, kind: true, createdAt: true, error: true },
    }),
  ]);
  return { settings, rules, runs, failures };
}

/** The settings a section writes, by key. */
function valuesOf(form: SettingsForm): [AutomationKey, unknown][] {
  switch (form.section) {
    case "alerts": {
      const disabled = form.disabled.filter((c): c is AlertCode =>
        (ALERT_CODES as string[]).includes(c),
      );
      return [
        [AUTOMATION_KEYS.alertRulesDisabled[0], disabled],
        [AUTOMATION_KEYS.coreTrainingCodes[0], form.coreCodes],
        [AUTOMATION_KEYS.requiredCompanions[0], form.companions],
      ];
    }
    case "digest":
      return [[AUTOMATION_KEYS.digestFrequency[0], form.frequency]];
    case "urgence":
      return [
        [AUTOMATION_KEYS.urgenceNotifyCodes[0], form.codes],
        [AUTOMATION_KEYS.urgenceNotifyRecipients[0], form.recipients],
      ];
    case "greetings":
      return [
        [AUTOMATION_KEYS.greetingEmailsEnabled[0], form.enabled],
        [AUTOMATION_KEYS.birthdayText[0], form.birthdayText],
        [AUTOMATION_KEYS.anniversaryText[0], form.anniversaryText],
      ];
  }
}

/** Saves one section of the settings (TOPAZE). */
export async function saveAutomationSettings(
  db: DbOrTx,
  actor: Actor,
  form: SettingsForm,
): Promise<void> {
  authorize(actor, "setting.manage");
  const values = valuesOf(form);
  for (const [key, value] of values) {
    if (!parseAutomationValue(key, value).success) {
      throw new DomainError("INVALID_DATA", "Valeur invalide.");
    }
  }
  if (form.section === "alerts" || form.section === "urgence") {
    const codes =
      form.section === "alerts"
        ? [...form.coreCodes, ...Object.entries(form.companions).flat(2)]
        : form.codes;
    const known = await db.referenceItem.findMany({
      where: { code: { in: codes } },
      select: { code: true },
    });
    const unknown = codes.filter((c) => !known.some((k) => k.code === c));
    if (unknown.length > 0) {
      throw new DomainError(
        "INVALID_DATA",
        `Code${unknown.length > 1 ? "s" : ""} inconnu${unknown.length > 1 ? "s" : ""} du référentiel : ${[...new Set(unknown)].join(", ")}.`,
      );
    }
  }
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    for (const [key, value] of values) {
      const before = await tx.setting.findUnique({ where: { key } });
      const json = value as Prisma.InputJsonValue;
      if (before) {
        const after = await tx.setting.update({
          where: { key },
          data: { value: json, updatedById: actor.userId },
        });
        audit.updated("Setting", before.id, before, after);
      } else {
        const created = await tx.setting.create({
          data: { key, value: json, createdById: actor.userId, updatedById: actor.userId },
        });
        audit.created("Setting", created.id, created);
      }
    }
  });
}

/** Changes a reminder rule: activity, delay, recipient profiles (TOPAZE). */
export async function updateReminderRule(
  db: DbOrTx,
  actor: Actor,
  input: { id: string; active: boolean; offsetDays: number; recipients: Profile[] },
): Promise<void> {
  authorize(actor, "reminderRule.manage");
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const before = await tx.reminderRule.findUnique({ where: { id: input.id } });
    if (!before) throw new DomainError("INVALID_DATA", "Règle introuvable.");
    const after = await tx.reminderRule.update({
      where: { id: input.id },
      data: {
        active: input.active,
        offsetDays: input.offsetDays,
        recipients: input.recipients,
        updatedById: actor.userId,
      },
    });
    audit.updated("ReminderRule", before.id, before, after);
  });
}
