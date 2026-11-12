import { isDemoLoginEnabled } from "@/lib/env";
import type { DbOrTx } from "../db";
import { DomainError } from "../errors";
import { recordLoginDenied } from "./events";
import { createUserSession } from "./session";
import { evaluateSignIn } from "./signIn";

/**
 * Demo sign-in (development and e2e tests only).
 *
 * Creates the session like the password sign-in (`session.ts`), with the same
 * checks (active account, at least one profile). It exists only when
 * AUTH_DEMO_LOGIN=true and VERCEL_ENV is not set, or AUTH_DEMO_ON_VERCEL=true (ADR-035) (the server refuses to start
 * otherwise), and only for `@binivol.test` addresses.
 */
export const DEMO_DOMAIN = "binivol.test";

/** Creates a database session for a demo account and returns its token. */
export async function createDemoSession(db: DbOrTx, email: string, now = new Date()) {
  if (!isDemoLoginEnabled()) {
    throw new DomainError("DEMO_LOGIN_DISABLED", "La connexion de démonstration est désactivée.");
  }
  const found = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { id: true, active: true, _count: { select: { profiles: true } } },
  });
  const decision = evaluateSignIn(
    { email, emailVerified: true },
    found ? { id: found.id, active: found.active, profileCount: found._count.profiles } : null,
    DEMO_DOMAIN,
  );
  if (!decision.ok) {
    await recordLoginDenied(db, decision);
    throw new DomainError("SIGN_IN_DENIED", decision.reason);
  }
  const session = await createUserSession(db, decision.userId, "demo", now);
  return { ...session, userId: decision.userId };
}

export interface DemoAccount {
  email: string;
  name: string;
  profiles: string[];
}

/** Active `@binivol.test` accounts, for the demo list of /connexion. Empty when the demo is off. */
export async function listDemoAccounts(db: DbOrTx): Promise<DemoAccount[]> {
  if (!isDemoLoginEnabled()) return [];
  const users = await db.user.findMany({
    where: { active: true, email: { endsWith: `@${DEMO_DOMAIN}` }, profiles: { some: {} } },
    orderBy: { email: "asc" },
    select: { email: true, name: true, profiles: { select: { profile: true } } },
  });
  return users.map((u) => ({
    email: u.email,
    name: u.name,
    profiles: u.profiles.map((p) => p.profile),
  }));
}
