import { z } from "zod";

/* Forms of the follow-ups and the B3 (step 11), shared by the actions and the tests. */

const id = z.string().min(1).max(40);
const isoDay = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
  .transform((v) => new Date(`${v}T00:00:00.000Z`));
const optionalDay = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim())
  .pipe(z.union([z.literal("").transform(() => null), isoDay]));

export const completeFollowUpSchema = z.object({
  followUpId: id,
  doneAt: isoDay,
  summary: z
    .string()
    .max(2000, "Le compte rendu fait 2 000 caractères au plus.")
    .optional()
    .transform((v) => (v ?? "").trim() || null),
  nextDate: optionalDay,
});

export const b3CheckSchema = z.object({
  personId: id,
  checkedAt: isoDay,
  status: z.enum(["CLEAR", "FLAGGED"], { error: "Choisissez l'issue." }),
});
