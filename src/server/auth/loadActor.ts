import type { Profile } from "@/generated/prisma/enums";
import type { DbOrTx } from "../db";
import type { Actor } from "../policy/types";

/**
 * Reads the account and its profiles. Null when the account is unknown,
 * deactivated or has no profile anymore.
 */
export async function loadActor(db: DbOrTx, userId: string): Promise<Actor | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      active: true,
      profiles: { select: { profile: true } },
    },
  });
  if (!user?.active || user.profiles.length === 0) return null;
  return {
    userId: user.id,
    name: user.name,
    email: user.email,
    profiles: new Set<Profile>(user.profiles.map((p) => p.profile)),
  };
}
