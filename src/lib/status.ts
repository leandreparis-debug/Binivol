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
  | "dossier-submitted";

/** Signature of the dossier and e-mail of the documents (step 8). */
export type SignatureStatusKey =
  | "signature-submitted"
  | "signature-volunteer_signed"
  | "signature-parent_signed"
  | "signature-to_countersign"
  | "signature-complete"
  | "signature-mail-sent"
  | "signature-mail-failed"
  | "signature-mail-pending";

export type Status = VolunteerStatus | DeadlineStatus | DossierStatusKey | SignatureStatusKey;

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
};

export const SIGNATURE_STATUSES: Record<SignatureStatusKey, StatusMeta> = {
  "signature-submitted": { label: "Envoyé, en attente de signature", tone: "warn" },
  "signature-volunteer_signed": { label: "Signé par le bénévole", tone: "accent" },
  "signature-parent_signed": { label: "Signé par le représentant légal", tone: "accent" },
  "signature-to_countersign": { label: "À contresigner", tone: "accent" },
  "signature-complete": { label: "Complet", tone: "ok" },
  "signature-mail-sent": { label: "E-mail envoyé", tone: "ok" },
  "signature-mail-failed": { label: "E-mail en échec", tone: "danger" },
  "signature-mail-pending": { label: "E-mail non envoyé", tone: "warn" },
};

export const STATUSES: Record<Status, StatusMeta> = {
  ...VOLUNTEER_STATUSES,
  ...DEADLINE_STATUSES,
  ...DOSSIER_STATUSES,
  ...SIGNATURE_STATUSES,
};

export const STATUS_KEYS = Object.keys(STATUSES) as Status[];

/** Returns the metadata of a status. */
export function getStatus(status: Status): StatusMeta {
  return STATUSES[status];
}
