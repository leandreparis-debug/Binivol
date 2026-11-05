import { z } from "zod";
import { NIVOL_EXAMPLE, normalizeNivol } from "./nivol";
import { isoDay, optionalEmail, optionalPhone } from "./personForms";

/**
 * Zod schemas of the integration forms (candidates, stages, finalisation,
 * mentorship). Client-safe: the same schema validates on the server and
 * gives the field-by-field French messages.
 */

const id = z.string().min(1).max(40);
const text = (max: number) =>
  z
    .string()
    .max(max, `${String(max)} caractères au maximum.`)
    .optional()
    .nullable()
    .transform((v) => {
      const t = (v ?? "").trim();
      return t === "" ? null : t;
    });
const optionalDay = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ?? "").trim())
  .pipe(z.union([z.literal("").transform(() => null), isoDay]));

export const STAGES = [
  "FIRST_CONTACT",
  "MEETING",
  "CONFIRMED",
  "FILE",
  "GAIA",
  "DONE",
  "ABANDONED",
] as const;
export const ABANDON_REASONS = [
  "NO_RESPONSE",
  "NOT_INTERESTED",
  "UNAVAILABLE",
  "REDIRECTED",
  "OTHER",
] as const;

/** A new candidate: first and last name, and an e-mail or a phone (at least one). */
export const newCandidateSchema = z
  .object({
    firstName: z.string().trim().min(1, "Le prénom est obligatoire.").max(100),
    lastName: z.string().trim().min(1, "Le nom est obligatoire.").max(100),
    email: optionalEmail,
    phone: optionalPhone,
    source: text(100),
    interest: text(200),
    firstContactAt: optionalDay,
    note: text(2000),
    /** « Créer quand même » after the duplicates were shown: their ids, for the audit. */
    confirmDuplicates: z.array(id).max(20).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.email && !value.phone) {
      ctx.addIssue({
        code: "custom",
        path: ["email"],
        message: "Indiquez au moins un e-mail ou un téléphone.",
      });
    }
  });
export type NewCandidateInput = z.input<typeof newCandidateSchema>;

/** Re-engagement of a person who left or is inactive: a new candidacy on her page. */
export const reengageSchema = z.object({
  personId: id,
  source: text(100),
  interest: text(200),
  note: text(2000),
});

/** A change of stage. `expectedStage` is the stage the screen showed (concurrency check). */
export const stageChangeSchema = z.object({
  candidacyId: id,
  expectedStage: z.enum(STAGES),
  toStage: z.enum(STAGES, { error: "Étape invalide." }),
  note: text(2000),
  abandonReason: z
    .enum([...ABANDON_REASONS, ""])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  nextAction: text(200),
  followUpAt: optionalDay,
});
export type StageChangeInput = z.input<typeof stageChangeSchema>;

/** `AAAA-MM-JJTHH:MM` (datetime-local), Paris wall clock; empty → null. */
const optionalLocalDateTime = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v ?? "").trim())
  .refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v), "Date et heure invalides.")
  .transform((v) => (v === "" ? null : v));

/** Fields of an open candidacy, editable at any stage. */
export const candidacyUpdateSchema = z.object({
  candidacyId: id,
  nextAction: text(200),
  followUpAt: optionalDay,
  meetingAt: optionalLocalDateTime,
  ownerId: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  source: text(100),
  interest: text(200),
  notes: text(4000),
});
export type CandidacyUpdateInput = z.input<typeof candidacyUpdateSchema>;

/** Finalisation (GAIA → DONE): NIVOL required, CRF e-mail optional, entry date. */
export const finalizeSchema = z.object({
  candidacyId: id,
  nivol: z.string({ error: "Le NIVOL est obligatoire." }).transform((v, ctx) => {
    const nivol = normalizeNivol(v);
    if (!nivol) {
      ctx.addIssue({
        code: "custom",
        message: v.trim()
          ? `NIVOL invalide : 11 chiffres suivis d'une lettre (ex. ${NIVOL_EXAMPLE}).`
          : "Le NIVOL est obligatoire.",
      });
      return z.NEVER;
    }
    return nivol;
  }),
  crfEmail: optionalEmail.refine(
    (v) => v === null || v.endsWith("@croix-rouge.fr"),
    "L'e-mail Croix-Rouge doit se terminer par @croix-rouge.fr.",
  ),
  entryDate: isoDay,
});
export type FinalizeInput = z.input<typeof finalizeSchema>;

export const assignMentorSchema = z.object({
  menteeId: id,
  mentorId: z.string({ error: "Choisissez un parrain." }).min(1, "Choisissez un parrain.").max(40),
  startDate: isoDay,
  note: text(1000),
});

export const endMentorshipSchema = z.object({
  mentorshipId: id,
  endDate: isoDay,
  note: text(1000),
});
