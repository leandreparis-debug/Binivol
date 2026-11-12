"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Profile } from "@/generated/prisma/enums";
import { defineAction } from "@/server/actions/defineAction";
import { appBaseUrl } from "@/server/baseUrl";
import { getDb } from "@/server/db";
import { inviteAccount, issueAccessLink, type IssuedLink } from "@/server/services/accountAccess";
import { setActive, setProfiles } from "@/server/services/accounts";

const profiles = z.array(z.enum(Object.values(Profile) as [Profile, ...Profile[]])).max(6);
const auditActor = (actor: { userId: string; name: string }) => ({
  userId: actor.userId,
  label: actor.name,
});

/** What the screen shows of a new link: once, to be copied. */
const linkView = (link: IssuedLink) => ({
  url: link.url,
  expiresAt: link.expiresAt.toISOString(),
  purpose: link.purpose,
  mailed: link.mailed,
  mailError: link.mailError ?? null,
});

/**
 * TOPAZE invites a responsible (ADR-070): the account, with at least one
 * profile and no password, and a single-use invitation link shown once
 * (and e-mailed when MAIL_DRIVER=smtp).
 */
export const inviteAccountAction = defineAction({
  action: "user.manage",
  input: z.object({
    email: z.email("Adresse e-mail invalide.").trim(),
    name: z.string().trim().max(120).default(""),
    username: z.string().trim().max(80).default(""),
    profiles: profiles.min(1, "Cochez au moins un profil."),
  }),
  handler: async ({ input, actor }) => {
    const { account, link } = await inviteAccount(getDb(), auditActor(actor), input, {
      baseUrl: await appBaseUrl(),
    });
    revalidatePath("/admin/comptes");
    return { id: account.id, email: account.email, link: linkView(link) };
  },
});

/**
 * A new access link for an account: invitation while no password is set,
 * new password afterwards. Revokes the previous unused links.
 */
export const issueAccessLinkAction = defineAction({
  action: "user.manage",
  input: z.object({ userId: z.string().min(1) }),
  handler: async ({ input, actor }) => {
    const link = await issueAccessLink(getDb(), auditActor(actor), input.userId, {
      baseUrl: await appBaseUrl(),
    });
    revalidatePath("/admin/comptes");
    return linkView(link);
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
