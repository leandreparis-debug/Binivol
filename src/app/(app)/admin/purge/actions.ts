"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { earlyPurge, purgePeople, retryStorageOrphans } from "@/server/services/purge";
import { getStorage } from "@/server/storage";

/* /admin/purge (step 14): TOPAZE only, typed confirmation. */

const confirm = z.literal("PURGER", { error: "Tapez PURGER pour confirmer." });

export const purgeAction = defineAction({
  action: "person.purge",
  input: z.object({
    personIds: z.array(z.string().min(1).max(40)).min(1, "Cochez au moins une fiche.").max(500),
    confirm,
  }),
  handler: async ({ input, actor }) => {
    const outcome = await purgePeople(getDb(), getStorage(), actor, { personIds: input.personIds });
    revalidatePath("/admin/purge");
    return outcome;
  },
});

export const earlyPurgeAction = defineAction({
  action: "person.purge",
  input: z.object({
    ref: z
      .string()
      .trim()
      .regex(/^P-\d{5,}$/, "Référence au format P-00012."),
    reason: z.string().trim().min(10, "Motif de 10 caractères au moins.").max(500),
    confirm,
  }),
  handler: async ({ input, actor }) => {
    const outcome = await earlyPurge(getDb(), getStorage(), actor, input);
    revalidatePath("/admin/purge");
    return outcome;
  },
});

export const retryOrphansAction = defineAction({
  action: "person.purge",
  input: z.object({}),
  handler: async ({ actor }) => {
    const result = await retryStorageOrphans(getDb(), getStorage(), actor);
    revalidatePath("/admin/purge");
    return result;
  },
});
