"use server";

import { z } from "zod";
import { definePublicAction } from "@/server/actions/defineAction";
import { signOut } from "@/server/auth/config";

/** Signs out: deletes the database session (LOGOUT is audited) and goes to /connexion. */
export const signOutAction = definePublicAction({
  input: z.object({}),
  handler: async () => {
    await signOut({ redirectTo: "/connexion" });
  },
});
