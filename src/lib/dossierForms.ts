import { z } from "zod";
import { dossierDraftSchema } from "./dossierSchema";

/**
 * Inputs of the dossier actions (public `/dossier` and on-site mode), and the
 * fixed choices of the form. Client-safe.
 */

/** « Activités souhaitées » of the Fiche de renseignements (4 at most). To confirm with the UL. */
export const ACTIVITY_OPTIONS = [
  "Secourisme (postes de secours)",
  "Urgence et réponse aux crises",
  "Action sociale (maraudes, aide alimentaire)",
  "Formation grand public",
  "Logistique",
  "Communication et vie associative",
] as const;

/** Driving licence categories (the licence itself is never asked). */
export const LICENSE_OPTIONS = ["AM", "A1", "A2", "A", "B", "BE", "C1", "C", "D1", "D"] as const;

export const GUARDIAN_QUALITIES = [
  "Mère",
  "Père",
  "Tuteur ou tutrice",
  "Autre représentant légal",
] as const;

export const SKILL_LEVEL_LABELS = {
  BEGINNER: "Débutant",
  CONFIRMED: "Confirmé",
  EXPERT: "Expert",
} as const;

export const LANGUAGE_LEVEL_LABELS = {
  NOTIONS: "Notions",
  FLUENT: "Courant",
  BILINGUAL: "Bilingue",
} as const;

/**
 * Pieces a candidate may attach. No copy of a diploma (ADR-049): Pegass is the
 * reference for diplomas, and a copy would be personal data kept for nothing.
 */
export const DOSSIER_ATTACHMENT_KINDS = ["PARENTAL_AUTH", "ADHESION"] as const;

/** Document kinds refused for any new file (the value stays in the enum for old rows). */
export const RETIRED_DOCUMENT_KINDS = ["DIPLOMA_COPY", "B3_ATTESTATION"] as const;
export type DossierAttachmentKind = (typeof DOSSIER_ATTACHMENT_KINDS)[number];

const id = z.string().min(1).max(40);

/** On-site actions name the person; public actions take it from the cookie. */
const scope = { personId: id.optional() };

export const saveDossierInput = z.object({ ...scope, data: dossierDraftSchema });
export const removeAttachmentInput = z.object({ ...scope, attachmentId: id });

const attachmentFields = z.object({
  ...scope,
  kind: z.enum(DOSSIER_ATTACHMENT_KINDS, { error: "Type de pièce invalide." }),
  file: z.instanceof(File, { error: "Choisissez un fichier." }),
});

/** The attachment form (FormData) parsed into typed values. */
export const attachmentFormInput = z.instanceof(FormData).transform((form, ctx) => {
  const personId = form.get("personId");
  const parsed = attachmentFields.safeParse({
    personId: typeof personId === "string" && personId !== "" ? personId : undefined,
    kind: form.get("kind"),
    file: form.get("file"),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
    }
    return z.NEVER;
  }
  return parsed.data;
});
