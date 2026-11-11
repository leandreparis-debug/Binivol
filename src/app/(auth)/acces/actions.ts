"use server";

import { z } from "zod";
import { definePublicAction } from "@/server/actions/defineAction";
import { PASSWORD_MAX_LENGTH } from "@/server/auth/password";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { enforceRateLimit } from "@/server/rateLimit";
import { completeAccessLink, inspectAccessLink } from "@/server/services/accountAccess";

const token = z.string().trim().max(64);

/**
 * Reads an invitation / new-password link (ADR-070). The token comes from the
 * address fragment, in the body of the POST. Limited per client.
 */
export const inspectAccessLinkAction = definePublicAction({
  input: z.object({ token }),
  handler: async ({ input }) => {
    const db = getDb();
    await enforceRateLimit(db, "accessLink");
    const view = await inspectAccessLink(db, input.token);
    return view.ok
      ? {
          ok: true as const,
          purpose: view.purpose,
          name: view.name,
          username: view.username,
          expiresAt: view.expiresAt.toISOString(),
        }
      : { ok: false as const };
  },
});

/** Uses the link: identifier (unless fixed) and password. The link then stops working. */
export const completeAccessLinkAction = definePublicAction({
  input: z.object({
    token,
    username: z.string().trim().max(80).optional(),
    password: z.string().max(PASSWORD_MAX_LENGTH * 4),
    confirmation: z.string().max(PASSWORD_MAX_LENGTH * 4),
  }),
  handler: async ({ input }) => {
    const db = getDb();
    await enforceRateLimit(db, "accessLink");
    if (input.password !== input.confirmation) {
      throw new DomainError("WEAK_PASSWORD", "Les deux mots de passe ne sont pas identiques.");
    }
    const { username } = await completeAccessLink(db, input);
    return { username };
  },
});
