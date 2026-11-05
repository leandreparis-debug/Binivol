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

/** State of a dossier link, and of the dossier itself (step 7). */
export type DossierStatusKey =
  | "link-active"
  | "link-expired"
  | "link-used"
  | "link-revoked"
  | "dossier-none"
  | "dossier-draft"
  | "dossier-submitted"
  | "dossier-to-countersign"
  | "dossier-complete"
  | "mail-sent"
  | "mail-failed";

/** State of a competence for a person (step 10, `src/server/qualification.ts`). */
export type QualificationStatusKey =
  | "qual-valid"
  | "qual-valid_undated"
  | "qual-expiring"
  | "qual-expired"
  | "qual-registered"
  | "qual-to_confirm"
  | "qual-function_active"
  | "qual-function_ended"
  | "qual-none";

export type Status = VolunteerStatus | DeadlineStatus | DossierStatusKey | QualificationStatusKey;

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

export const DOSSIER_STATUSES: Record<DossierStatusKey, StatusMeta> = {
  "link-active": { label: "Actif", tone: "accent" },
  "link-expired": { label: "Expiré", tone: "neutral" },
  "link-used": { label: "Utilisé", tone: "ok" },
  "link-revoked": { label: "Révoqué", tone: "ink" },
  "dossier-none": { label: "Pas commencé", tone: "neutral" },
  "dossier-draft": { label: "En cours de saisie", tone: "warn" },
  "dossier-submitted": { label: "Envoyé", tone: "accent" },
  "dossier-to-countersign": { label: "À contresigner", tone: "warn" },
  "dossier-complete": { label: "Complet", tone: "ok" },
  "mail-sent": { label: "E-mail envoyé", tone: "ok" },
  "mail-failed": { label: "E-mail en échec", tone: "danger" },
};

export const QUALIFICATION_STATUSES: Record<QualificationStatusKey, StatusMeta> = {
  "qual-valid": { label: "Valide", tone: "ok" },
  "qual-valid_undated": { label: "Valide (date inconnue)", tone: "ok" },
  "qual-expiring": { label: "Expire bientôt", tone: "warn" },
  "qual-expired": { label: "Expirée", tone: "danger" },
  "qual-registered": { label: "Inscrit(e)", tone: "accent" },
  "qual-to_confirm": { label: "À confirmer", tone: "warn" },
  "qual-function_active": { label: "Fonction en cours", tone: "ok" },
  "qual-function_ended": { label: "Fonction terminée", tone: "neutral" },
  "qual-none": { label: "Aucune", tone: "neutral" },
};

/** `VALID` → `qual-valid` (the server state as a status of `StatusDot`). */
export function qualificationKey(status: string): QualificationStatusKey {
  return `qual-${status.toLowerCase()}` as QualificationStatusKey;
}

export const STATUSES: Record<Status, StatusMeta> = {
  ...VOLUNTEER_STATUSES,
  ...DEADLINE_STATUSES,
  ...DOSSIER_STATUSES,
  ...QUALIFICATION_STATUSES,
};

export const STATUS_KEYS = Object.keys(STATUSES) as Status[];

/** Returns the metadata of a status. */
export function getStatus(status: Status): StatusMeta {
  return STATUSES[status];
}
