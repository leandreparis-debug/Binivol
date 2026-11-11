"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { definePublicAction } from "@/server/actions/defineAction";
import { createDemoSession } from "@/server/auth/demo";
import { PASSWORD_MAX_LENGTH } from "@/server/auth/password";
import { signInWithPassword } from "@/server/auth/passwordSignIn";
import { setSessionCookie } from "@/server/auth/session";
import { SIGN_IN_DENIAL_MESSAGES } from "@/server/auth/signIn";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { enforceRateLimit } from "@/server/rateLimit";

/**
 * Identifier + password sign-in (ADR-070). Limited per client here, and per
 * identifier in `signInWithPassword`. One message for an unknown identifier
 * and a wrong password.
 */
export const passwordSignInAction = definePublicAction({
  input: z.object({
    username: z.string().trim().min(1, "Saisissez votre identifiant.").max(80),
    password: z
      .string()
      .min(1, "Saisissez votre mot de passe.")
      .max(PASSWORD_MAX_LENGTH * 4),
  }),
  handler: async ({ input }) => {
    const db = getDb();
    await enforceRateLimit(db, "signIn");
    const result = await signInWithPassword(db, input);
    if (!result.ok) {
      throw new DomainError("SIGN_IN_DENIED", SIGN_IN_DENIAL_MESSAGES[result.reason]);
    }
    await setSessionCookie(result.sessionToken, result.expires);
    redirect("/");
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
