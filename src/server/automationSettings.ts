import { z } from "zod";
import { ALERT_CODES, type AlertCode } from "./alerts/rules";
import type { DbOrTx } from "./db";

/**
 * Settings of the alerts, reminders and automatic e-mails (step 12), edited
 * by TOPAZE on /admin/reglages. Each value is parsed by Zod; an invalid or
 * missing value falls back to its default (never a crash).
 */

export const DIGEST_FREQUENCIES = ["MONTHLY", "WEEKLY", "OFF"] as const;
export type DigestFrequency = (typeof DIGEST_FREQUENCIES)[number];

export const DIGEST_FREQUENCY_LABELS: Record<DigestFrequency, string> = {
  MONTHLY: "Mensuel (le 1er du mois)",
  WEEKLY: "Hebdomadaire (le lundi)",
  OFF: "Désactivé",
};

export const GREETING_SIGNATURE = "L'équipe Cadre";

export const BIRTHDAY_TEXT_DEFAULT = [
  "Bonjour {prenom},",
  "",
  "Toute l'unité locale te souhaite un très joyeux anniversaire !",
  "Merci pour ton engagement à nos côtés.",
  "",
  GREETING_SIGNATURE,
].join("\n");

export const ANNIVERSARY_TEXT_DEFAULT = [
  "Bonjour {prenom},",
  "",
  "Il y a {annees} ans aujourd'hui, tu rejoignais la Croix-Rouge française à {ul}.",
  "Merci pour tout ce que tu fais, on est heureux de t'avoir dans l'équipe.",
  "",
  GREETING_SIGNATURE,
].join("\n");

const codes = z.array(z.string().trim().min(1).max(20)).max(50);
const emails = z.array(z.email()).max(30);

const SCHEMAS = {
  ALERT_RULES_DISABLED: z
    .array(z.string())
    .transform((list) => list.filter((c): c is AlertCode => (ALERT_CODES as string[]).includes(c))),
  CORE_TRAINING_CODES: codes,
  REQUIRED_COMPANIONS: z.record(z.string().min(1).max(20), codes),
  DIGEST_FREQUENCY: z.enum(DIGEST_FREQUENCIES),
  URGENCE_NOTIFY_CODES: codes,
  URGENCE_NOTIFY_RECIPIENTS: emails,
  GREETING_EMAILS_ENABLED: z.boolean(),
  GREETING_BIRTHDAY_TEXT: z.string().trim().min(10).max(2000),
  GREETING_ANNIVERSARY_TEXT: z.string().trim().min(10).max(2000),
} as const;

export type AutomationKey = keyof typeof SCHEMAS;

export interface AutomationSettings {
  alertRulesDisabled: AlertCode[];
  coreTrainingCodes: string[];
  requiredCompanions: Record<string, string[]>;
  digestFrequency: DigestFrequency;
  urgenceNotifyCodes: string[];
  urgenceNotifyRecipients: string[];
  greetingEmailsEnabled: boolean;
  birthdayText: string;
  anniversaryText: string;
}

export const AUTOMATION_DEFAULTS: AutomationSettings = {
  alertRulesDisabled: [],
  coreTrainingCodes: ["CRB", "TCAU", "TCAS"],
  requiredCompanions: { PSE: ["OPR", "ECG"] },
  digestFrequency: "MONTHLY",
  urgenceNotifyCodes: ["TCAU"],
  urgenceNotifyRecipients: [],
  greetingEmailsEnabled: false,
  birthdayText: BIRTHDAY_TEXT_DEFAULT,
  anniversaryText: ANNIVERSARY_TEXT_DEFAULT,
};

/** Setting key of each field, and the description written by the base seed. */
export const AUTOMATION_KEYS: Record<keyof AutomationSettings, [AutomationKey, string]> = {
  alertRulesDisabled: ["ALERT_RULES_DISABLED", "Règles d'alerte désactivées (codes)."],
  coreTrainingCodes: ["CORE_TRAINING_CODES", "Tronc commun : codes du référentiel attendus."],
  requiredCompanions: [
    "REQUIRED_COMPANIONS",
    "Compétences associées : une compétence valide exige ces codes (PSE → OPR, ECG).",
  ],
  digestFrequency: [
    "DIGEST_FREQUENCY",
    "Récapitulatif des alertes par e-mail : MONTHLY, WEEKLY ou OFF.",
  ],
  urgenceNotifyCodes: [
    "URGENCE_NOTIFY_CODES",
    "Prévenance du pôle Urgence : formations qui déclenchent l'e-mail.",
  ],
  urgenceNotifyRecipients: [
    "URGENCE_NOTIFY_RECIPIENTS",
    "Prévenance du pôle Urgence : destinataires (vide : rien ne part).",
  ],
  greetingEmailsEnabled: [
    "GREETING_EMAILS_ENABLED",
    "Envoi des e-mails d'anniversaire et d'anniversaire d'engagement (MAILS_VOEUX_ACTIFS).",
  ],
  birthdayText: ["GREETING_BIRTHDAY_TEXT", "E-mail d'anniversaire ({prenom}, {ul}). Jamais l'âge."],
  anniversaryText: [
    "GREETING_ANNIVERSARY_TEXT",
    "E-mail d'anniversaire d'engagement ({prenom}, {annees}, {ul}).",
  ],
};

const FIELDS = Object.keys(AUTOMATION_KEYS) as (keyof AutomationSettings)[];

/** Reads the automation settings in one query. */
export async function automationSettings(db: DbOrTx): Promise<AutomationSettings> {
  const keys = FIELDS.map((f) => AUTOMATION_KEYS[f][0]);
  const rows = await db.setting.findMany({ where: { key: { in: keys } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const result = { ...AUTOMATION_DEFAULTS } as Record<keyof AutomationSettings, unknown>;
  for (const field of FIELDS) {
    const [key] = AUTOMATION_KEYS[field];
    const parsed = SCHEMAS[key].safeParse(byKey.get(key));
    if (parsed.success) result[field] = parsed.data;
  }
  return result as unknown as AutomationSettings;
}

/** Validates one value before it is written (settings screen). */
export function parseAutomationValue(key: AutomationKey, value: unknown) {
  return SCHEMAS[key].safeParse(value);
}
