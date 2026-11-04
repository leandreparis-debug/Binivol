/**
 * PROVISIONAL — synthetic user for the application shell.
 *
 * Replaced at step 3 by the real session (Google sign-in restricted to
 * `@croix-rouge.fr`). This is NOT a real person; it exists only so the
 * top bar has something to display.
 */

/** The six responsibility profiles. They can be combined on one person. */
export type Profile = "TOPAZE" | "ACTION" | "LASER" | "FORMAT" | "FORMAT_GP" | "DIAMANT";

export const PROFILE_LABELS: Record<Profile, string> = {
  TOPAZE: "TOPAZE · DLUS",
  ACTION: "ACTION · Missions de secours",
  LASER: "LASER · Urgence",
  FORMAT: "FORMAT · Formation interne",
  FORMAT_GP: "FORMAT GP · Formation grand public",
  DIAMANT: "DIAMANT · Animation des équipes",
};

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
