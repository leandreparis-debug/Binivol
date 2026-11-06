"use server";

import { revalidatePath } from "next/cache";
import { reminderRuleSchema, settingsFormSchema } from "@/lib/settingsForms";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { saveAutomationSettings, updateReminderRule } from "@/server/services/automationAdmin";

/* /admin/reglages (step 12): TOPAZE only. */

export const saveSettingsAction = defineAction({
  action: "setting.manage",
  input: settingsFormSchema,
  handler: async ({ input, actor }) => {
    await saveAutomationSettings(getDb(), actor, input);
    revalidatePath("/admin/reglages");
    return null;
  },
});

export const saveReminderRuleAction = defineAction({
  action: "reminderRule.manage",
  input: reminderRuleSchema,
  handler: async ({ input, actor }) => {
    await updateReminderRule(getDb(), actor, input);
    revalidatePath("/admin/reglages");
    return null;
  },
});
