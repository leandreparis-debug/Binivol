"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { definePublicAction } from "@/server/actions/defineAction";
import { signIn } from "@/server/auth/config";
import { createDemoSession, setSessionCookie } from "@/server/auth/demo";
import { getDb } from "@/server/db";
import { enforceRateLimit } from "@/server/rateLimit";

/** Starts the Google sign-in (Auth.js redirects to Google, then back). */
export const googleSignInAction = definePublicAction({
  input: z.object({}),
  handler: async () => {
    await enforceRateLimit(getDb(), "signIn");
    await signIn("google", { redirectTo: "/" });
  },
});

/**
 * Demo sign-in with a `@binivol.test` seed account. Refused unless
 * AUTH_DEMO_LOGIN=true outside Vercel (checked again in `createDemoSession`).
 */
export const demoSignInAction = definePublicAction({
  input: z.object({ email: z.email().trim() }),
  handler: async ({ input }) => {
    const session = await createDemoSession(getDb(), input.email);
    await setSessionCookie(session.sessionToken, session.expires);
    redirect("/");
  },
});
