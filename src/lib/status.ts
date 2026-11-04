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
  candidate: { label: "Candidat", tone: "accent" },
  active: { label: "Actif", tone: "ok" },
  paused: { label: "En pause", tone: "warn" },
  suspended: { label: "Suspendu", tone: "danger" },
  inactive: { label: "Inactif", tone: "neutral" },
  left: { label: "Parti(e)", tone: "ink" },
};

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
