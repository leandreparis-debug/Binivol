import { z } from "zod";
import { ReferenceCategory, TrainingResult } from "@/generated/prisma/enums";

/**
 * Inputs of the trainings and appointments actions (step 10). Client-safe.
 * Dates are `AAAA-MM-JJ` (calendar days, 00:00 UTC once parsed).
 */

const id = z.string().min(1).max(40);
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide (JJ/MM/AAAA).")
  .transform((v) => new Date(`${v}T00:00:00.000Z`));
const optionalDay = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .pipe(z.union([z.literal("").transform(() => null), isoDay]));
const text = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const t = (v ?? "").trim();
      return t === "" ? null : t.slice(0, max);
    });
const reason = z.string().trim().min(3, "Le motif est obligatoire.").max(500);

/** An optional whole number typed in a text field (« » → null). */
const optionalInt = (min: number, max: number, message: string) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      const t = (v ?? "").trim();
      if (t === "") return null;
      const n = Number(t);
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return n;
    });

export const ENTRY_RESULTS = ["REGISTERED", "PASSED", "FAILED", "ABSENT", "TO_CONFIRM"] as const;

export const groupEntrySchema = z.object({
  referenceId: id,
  date: optionalDay,
  result: z.enum(ENTRY_RESULTS, { error: "Choisissez un résultat." }),
  personIds: z.array(id).min(1, "Choisissez au moins une personne.").max(60),
  sessionId: id.nullable().optional(),
  place: text(120),
  comment: text(500),
  acceptedWarnings: z.string().max(4000).nullable().optional(),
});

export const sessionSchema = z
  .object({
    referenceId: id,
    startDate: isoDay,
    endDate: optionalDay,
    place: text(120),
    pegassUrl: z
      .string()
      .optional()
      .transform((v) => (v ?? "").trim())
      .pipe(z.union([z.literal("").transform(() => null), z.url("Lien invalide.")])),
    capacity: optionalInt(1, 500, "Nombre de places invalide (1 à 500)."),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    message: "La date de fin est avant la date de début.",
    path: ["endDate"],
  });

export const cancelSchema = z.object({ id, reason });

export const resultsSchema = z.object({
  recordIds: z.array(id).min(1, "Cochez au moins une ligne.").max(200),
  result: z.enum(Object.values(TrainingResult) as [TrainingResult, ...TrainingResult[]]),
  date: optionalDay,
});

export const wishSchema = z.object({
  personId: id,
  referenceId: id,
  priority: z.coerce.number().int().min(0).max(10).default(0),
  comment: text(500),
});

export const scheduleSchema = z.object({ wishId: id, sessionId: id });

export const referenceSchema = z.object({
  id,
  label: z.string().trim().min(2, "Le libellé est obligatoire.").max(120),
  category: z.enum(Object.values(ReferenceCategory) as [ReferenceCategory, ...ReferenceCategory[]]),
  validityMonths: optionalInt(1, 240, "Validité invalide (1 à 240 mois)."),
  expiresEndOfYear: z.boolean(),
  forbiddenForMinors: z.boolean(),
  managedBy: z
    .array(z.enum(["TOPAZE", "ACTION", "LASER", "FORMAT", "FORMAT_GP", "DIAMANT"]))
    .max(6),
  active: z.boolean(),
  prerequisiteIds: z.array(id).max(10),
});

export const appointmentSchema = z.object({
  personId: id,
  referenceId: id,
  startDate: isoDay,
  authorizedBy: text(120),
  decisionRef: text(80),
  comment: text(500),
  acceptedWarnings: z.string().max(4000).nullable().optional(),
});

export const endAppointmentSchema = z.object({ id, endDate: isoDay });
