import type { DbOrTx } from "./db";
import { DEFAULT_SIGNED_DOSSIER_MAIL } from "./mail/templates";

/**
 * Numeric settings read by the screens, with their defaults (same values as
 * the base seed). One query for all of them.
 */
export interface NumericSettings {
  /** `ALERT_DAYS_BEFORE_EXPIRY`: a deadline within this many days is « proche ». */
  alertDays: number;
  /** `RETENTION_YEARS_AFTER_LEAVE`: `purgeEligibleAt` = departure + N years. */
  retentionYears: number;
  /** `NEW_VOLUNTEER_MONTHS`: DIAMANT scope of newcomers. */
  newVolunteerMonths: number;
  /** `CANDIDACY_FOLLOW_UP_DAYS`: default follow-up date after a change of stage. */
  candidacyFollowUpDays: number;
}

export const DEFAULT_SETTINGS: NumericSettings = {
  alertDays: 60,
  retentionYears: 5,
  newVolunteerMonths: 12,
  candidacyFollowUpDays: 7,
};

const KEYS: Record<keyof NumericSettings, string> = {
  alertDays: "ALERT_DAYS_BEFORE_EXPIRY",
  retentionYears: "RETENTION_YEARS_AFTER_LEAVE",
  newVolunteerMonths: "NEW_VOLUNTEER_MONTHS",
  candidacyFollowUpDays: "CANDIDACY_FOLLOW_UP_DAYS",
};

function asCount(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : fallback;
}

/** Text settings of the online file, with their defaults. */
export interface DossierSettings {
  /** `DOSSIER_LINK_DAYS`: validity of a dossier link. */
  linkDays: number;
  /** `UL_NAME`: « Structure de rattachement ». */
  ulName: string;
  /** `RGPD_NOTICE`: the GDPR notice shown before submission. */
  rgpdNotice: string;
  /** `UL_CITY`: « Fait à » of the signed documents. */
  ulCity: string;
  /** `VOLUNTEER_DOSSIER_MAIL`: e-mail of the signed documents (`{prenom}`, `{structure}`, `{pieces}`). */
  signedMail: { subject: string; body: string };
}

function mailTemplate(value: unknown): { subject: string; body: string } {
  if (typeof value === "object" && value !== null) {
    const { subject, body } = value as { subject?: unknown; body?: unknown };
    if (typeof subject === "string" && subject.trim() && typeof body === "string" && body.trim()) {
      return { subject, body };
    }
  }
  return DEFAULT_SIGNED_DOSSIER_MAIL;
}

export async function dossierSettings(db: DbOrTx): Promise<DossierSettings> {
  const rows = await db.setting.findMany({
    where: {
      key: {
        in: ["DOSSIER_LINK_DAYS", "UL_NAME", "RGPD_NOTICE", "UL_CITY", "VOLUNTEER_DOSSIER_MAIL"],
      },
    },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const text = (key: string, fallback: string) => {
    const v = byKey.get(key);
    return typeof v === "string" && v.trim() !== "" ? v : fallback;
  };
  return {
    linkDays: asCount(byKey.get("DOSSIER_LINK_DAYS"), 7) || 7,
    ulName: text("UL_NAME", "Unité locale de Versailles"),
    ulCity: text("UL_CITY", "Versailles"),
    signedMail: mailTemplate(byKey.get("VOLUNTEER_DOSSIER_MAIL")),
    rgpdNotice: text(
      "RGPD_NOTICE",
      "Information sur le traitement des données : texte à définir (à faire valider par le DPO).",
    ),
  };
}

export async function numericSettings(db: DbOrTx): Promise<NumericSettings> {
  const rows = await db.setting.findMany({
    where: { key: { in: Object.values(KEYS) } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  return {
    alertDays: asCount(byKey.get(KEYS.alertDays), DEFAULT_SETTINGS.alertDays),
    retentionYears: asCount(byKey.get(KEYS.retentionYears), DEFAULT_SETTINGS.retentionYears),
    newVolunteerMonths: asCount(
      byKey.get(KEYS.newVolunteerMonths),
      DEFAULT_SETTINGS.newVolunteerMonths,
    ),
    candidacyFollowUpDays: asCount(
      byKey.get(KEYS.candidacyFollowUpDays),
      DEFAULT_SETTINGS.candidacyFollowUpDays,
    ),
  };
}
