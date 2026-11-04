/**
 * PROVISIONAL — synthetic user for the application shell.
 *
 * Replaced at step 3 by the real session (Google sign-in restricted to
 * `@croix-rouge.fr`). This is NOT a real person; it exists only so the
 * top bar has something to display.
 */

import type { Profile } from "@/generated/prisma/enums";

export type { Profile };
export { PROFILE_LABELS } from "@/lib/labels";

export interface DevUser {
  firstName: string;
  lastName: string;
  profiles: Profile[];
}

export const devUser: DevUser = {
  firstName: "Léandre",
  lastName: "Démo",
  profiles: ["TOPAZE"],
};
