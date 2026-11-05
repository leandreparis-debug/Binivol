"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toParisDay } from "@/lib/dates";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { loadPersonFacts } from "@/server/policy/facts";
import { recordB3Check } from "@/server/sensitive";
import { completeFollowUp, followUpPerson } from "@/server/services/followUps";

/* Follow-ups and B3 (step 11). */

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

const refresh = () => {
  revalidatePath("/benevoles/[ref]", "page");
  revalidatePath("/candidats/suivi");
};

async function personResource(personId: string | null) {
  const facts = personId ? await loadPersonFacts(getDb(), personId, toParisDay()) : null;
  if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  return { person: facts };
}

export const completeFollowUpAction = defineAction({
  action: "followUp.manage",
  input: z.object({
    followUpId: id,
    doneAt: isoDay,
    summary: z
      .string()
      .max(2000, "Le compte rendu fait 2 000 caractères au plus.")
      .optional()
      .transform((v) => (v ?? "").trim() || null),
    nextDate: optionalDay,
  }),
  resource: async (input) => personResource(await followUpPerson(getDb(), input.followUpId)),
  handler: async ({ input, actor }) => {
    const result = await completeFollowUp(getDb(), actor, { ...input, conductedById: null });
    refresh();
    return result;
  },
});

export const recordB3Action = defineAction({
  action: "b3.manage",
  input: z.object({
    personId: id,
    checkedAt: isoDay,
    status: z.enum(["CLEAR", "FLAGGED"], { error: "Choisissez l'issue." }),
  }),
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    await recordB3Check(getDb(), actor, input);
    refresh();
    return null;
  },
});
