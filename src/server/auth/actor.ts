import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "../db";
import type { Actor } from "../policy/types";
import { auth } from "./config";
import { loadActor } from "./loadActor";

export { loadActor };

/**
 * The signed-in responsible, or null. The session only carries the user id:
 * the account, its activity and its **profiles are re-read on every request**,
 * so a removed profile or a deactivation takes effect immediately.
 * Cached per request (React `cache`).
 */
export const getActor = cache(async (): Promise<Actor | null> => {
  const session = await auth();
  const userId = session?.user.id;
  return userId ? loadActor(getDb(), userId) : null;
});

/** Like `getActor`, but redirects to /connexion when nobody is signed in. */
export async function requireActor(): Promise<Actor> {
  const actor = await getActor();
  if (!actor) redirect("/connexion");
  return actor;
}
