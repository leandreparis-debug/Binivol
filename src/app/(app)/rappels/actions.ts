"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/server/services/notifications";

/* The bell and /rappels (step 12): a responsible reads only her own notifications. */

export const recentNotificationsAction = defineAction({
  action: "notification.readOwn",
  input: z.object({}),
  handler: async ({ actor }) => listNotifications(getDb(), actor.userId, 8),
});

export const markAllReadAction = defineAction({
  action: "notification.readOwn",
  input: z.object({}),
  handler: async ({ actor }) => {
    const count = await markAllNotificationsRead(getDb(), actor.userId);
    revalidatePath("/", "layout");
    return count;
  },
});

export const markReadAction = defineAction({
  action: "notification.readOwn",
  input: z.object({ id: z.string().min(1).max(40) }),
  handler: async ({ input, actor }) => {
    await markNotificationRead(getDb(), actor.userId, input.id);
    revalidatePath("/", "layout");
    return null;
  },
});
