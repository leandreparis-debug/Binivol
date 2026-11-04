import type { PersonStatus } from "@/generated/prisma/enums";
import { PERSON_STATUS_LABELS } from "@/lib/labels";

/**
 * Central registry of statuses: labels (French) and colour tones.
 * A status is never conveyed by colour alone; `StatusDot` always renders the label.
 */

/** Lifecycle status of a volunteer. */
export type VolunteerStatus = "candidate" | "active" | "paused" | "suspended" | "inactive" | "left";

/** Status of a deadline (training validity, nomination, follow-up…). */
export type DeadlineStatus = "ok" | "soon" | "expired";

export type Status = VolunteerStatus | DeadlineStatus;

/** Colour tone, mapped to design tokens by the components. */
export type Tone = "neutral" | "accent" | "ok" | "warn" | "danger" | "ink";

export interface StatusMeta {
  label: string;
  tone: Tone;
}

export const VOLUNTEER_STATUSES: Record<VolunteerStatus, StatusMeta> = {
  candidate: { label: PERSON_STATUS_LABELS.CANDIDATE, tone: "accent" },
  active: { label: PERSON_STATUS_LABELS.ACTIVE, tone: "ok" },
  paused: { label: PERSON_STATUS_LABELS.PAUSED, tone: "warn" },
  suspended: { label: PERSON_STATUS_LABELS.SUSPENDED, tone: "danger" },
  inactive: { label: PERSON_STATUS_LABELS.INACTIVE, tone: "neutral" },
  left: { label: PERSON_STATUS_LABELS.LEFT, tone: "ink" },
};

/** Maps the database status of a person to the UI status of `StatusDot`. */
export function toVolunteerStatus(status: PersonStatus): VolunteerStatus {
  return status.toLowerCase() as VolunteerStatus;
}

export const DEADLINE_STATUSES: Record<DeadlineStatus, StatusMeta> = {
  ok: { label: "À jour", tone: "ok" },
  soon: { label: "Échéance proche", tone: "warn" },
  expired: { label: "Expiré", tone: "danger" },
};

export const STATUSES: Record<Status, StatusMeta> = {
  ...VOLUNTEER_STATUSES,
  ...DEADLINE_STATUSES,
};

export const STATUS_KEYS = Object.keys(STATUSES) as Status[];

/** Returns the metadata of a status. */
export function getStatus(status: Status): StatusMeta {
  return STATUSES[status];
}
