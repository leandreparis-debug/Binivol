"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Profile } from "@/generated/prisma/enums";
import { getEnv } from "@/lib/env";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { createAccount, setActive, setProfiles } from "@/server/services/accounts";

const profiles = z.array(z.enum(Object.values(Profile) as [Profile, ...Profile[]])).max(6);
const auditActor = (actor: { userId: string; name: string }) => ({
  userId: actor.userId,
  label: actor.name,
});

/** TOPAZE adds an account of the allowed domain, with at least one profile. */
export const createAccountAction = defineAction({
  action: "user.manage",
  input: z.object({
    email: z.email("Adresse e-mail invalide.").trim(),
    name: z.string().trim().max(120).default(""),
    profiles: profiles.min(1, "Cochez au moins un profil."),
  }),
  handler: async ({ input, actor }) => {
    const env = getEnv();
    const allowedDomains = [
      env.AUTH_ALLOWED_DOMAIN,
      ...(env.AUTH_DEMO_LOGIN ? ["binivol.test"] : []),
    ];
    const account = await createAccount(getDb(), auditActor(actor), input, { allowedDomains });
    revalidatePath("/admin/comptes");
    return { id: account.id };
  },
});

/** TOPAZE replaces the profiles of an account (last-TOPAZE and self guards). */
export const updateProfilesAction = defineAction({
  action: "user.manage",
  input: z.object({ userId: z.string().min(1), profiles }),
  handler: async ({ input, actor }) => {
    await setProfiles(getDb(), auditActor(actor), input);
    revalidatePath("/admin/comptes");
    return null;
  },
});

/** TOPAZE deactivates (signs out) or reactivates an account. Never deletes it. */
export const setAccountActiveAction = defineAction({
  action: "user.manage",
  input: z.object({ userId: z.string().min(1), active: z.boolean() }),
  handler: async ({ input, actor }) => {
    await setActive(getDb(), auditActor(actor), input);
    revalidatePath("/admin/comptes");
    return null;
  },
});
