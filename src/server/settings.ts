import { parseDiplomaCatalog, type DiplomaCatalogItem } from "@/lib/diplomas";
import type { DbOrTx } from "./db";

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
  /** `UL_CITY`: « Fait à » of the charte. */
  ulCity: string;
  /** `FINAL_MAIL_TEXT`: e-mail with the signed documents ({prenom}, {pieces}, {ul}). */
  finalMailText: string;
  /** `DECLARED_DIPLOMA_CATALOG`: diplomas offered in the dossier (step 16). */
  diplomaCatalog: readonly DiplomaCatalogItem[];
}

export const FINAL_MAIL_DEFAULT = [
  "Bonjour {prenom},",
  "",
  "Ton dossier de bénévole est complet : merci, et bienvenue à la Croix-Rouge française !",
  "",
  "Tu trouveras en pièces jointes :",
  "{pieces}",
  "",
  "La suite : l'unité locale crée ton compte Croix-Rouge et ton NIVOL, ton numéro de bénévole. Tu recevras un e-mail pour activer ton compte, puis nous te proposerons tes premières formations.",
  "",
  "Garde bien ces documents, ils sont ta copie.",
  "",
  "À très vite,",
  "{ul}",
  "Croix-Rouge française",
].join("\n");

export async function dossierSettings(db: DbOrTx): Promise<DossierSettings> {
  const rows = await db.setting.findMany({
    where: {
      key: {
        in: [
          "DOSSIER_LINK_DAYS",
          "UL_NAME",
          "RGPD_NOTICE",
          "UL_CITY",
          "FINAL_MAIL_TEXT",
          "DECLARED_DIPLOMA_CATALOG",
        ],
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
    rgpdNotice: text(
      "RGPD_NOTICE",
      "Information sur le traitement des données : texte à définir (à faire valider par le DPO).",
    ),
    ulCity: text("UL_CITY", "Versailles"),
    finalMailText: text("FINAL_MAIL_TEXT", FINAL_MAIL_DEFAULT),
    diplomaCatalog: parseDiplomaCatalog(byKey.get("DECLARED_DIPLOMA_CATALOG")),
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
