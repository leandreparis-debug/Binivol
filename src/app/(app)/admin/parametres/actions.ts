"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { linesToIndicators } from "@/lib/indicators";
import { DomainError } from "@/server/errors";
import { previewIndicators } from "@/server/services/dlusDashboard";
import { saveParameter } from "@/server/services/parameters";

/* /admin/parametres (step 14): TOPAZE; validation by the parameter registry. */
export const saveParameterAction = defineAction({
  action: "setting.manage",
  input: z.object({
    key: z.string().regex(/^[A-Z_]{2,60}$/),
    value: z.string().max(8000),
  }),
  handler: async ({ input, actor }) => {
    await saveParameter(getDb(), actor, input.key, input.value);
    revalidatePath("/admin/parametres");
    return null;
  },
});

/** « Aperçu » of the DLUS indicators typed, before saving them (step 16). */
export const previewIndicatorsAction = defineAction({
  action: "setting.manage",
  input: z.object({ value: z.string().max(8000) }),
  handler: async ({ input, actor }) => {
    const parsed = linesToIndicators(input.value);
    if (!parsed.ok) throw new DomainError("INVALID_DATA", parsed.error);
    return previewIndicators(getDb(), actor, parsed.value);
  },
});
