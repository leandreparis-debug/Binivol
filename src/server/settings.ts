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
