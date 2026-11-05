"use server";

import { revalidatePath } from "next/cache";
import { b3CheckSchema, completeFollowUpSchema } from "@/lib/followUpForms";
import { toParisDay } from "@/lib/dates";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { loadPersonFacts } from "@/server/policy/facts";
import { recordB3Check } from "@/server/sensitive";
import { completeFollowUp, followUpPerson } from "@/server/services/followUps";

/* Follow-ups and B3 (step 11). */

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
  input: completeFollowUpSchema,
  resource: async (input) => personResource(await followUpPerson(getDb(), input.followUpId)),
  handler: async ({ input, actor }) => {
    const result = await completeFollowUp(getDb(), actor, { ...input, conductedById: null });
    refresh();
    return result;
  },
});

export const recordB3Action = defineAction({
  action: "b3.manage",
  input: b3CheckSchema,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    await recordB3Check(getDb(), actor, input);
    refresh();
    return null;
  },
});
