import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { isDemoLoginEnabled } from "@/lib/env";
import type { DbOrTx } from "../db";
import { DomainError } from "../errors";
import { SESSION_MAX_AGE_SECONDS, sessionCookie } from "./cookies";
import { recordLogin, recordLoginDenied } from "./events";
import { evaluateSignIn } from "./signIn";

/**
 * Demo sign-in (development and e2e tests only).
 *
 * Auth.js credentials providers cannot use database sessions, so the demo
 * sign-in creates the session row and cookie itself, with exactly the same
 * name, lifetime and checks as a Google session. It exists only when
 * AUTH_DEMO_LOGIN=true and VERCEL_ENV is not set (the server refuses to start
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
  const sessionToken = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await db.session.create({ data: { sessionToken, userId: decision.userId, expires } });
  await recordLogin(db, decision.userId, "demo");
  return { sessionToken, expires, userId: decision.userId };
}

/** Sets the session cookie (to be called from a Server Action or Route Handler). */
export async function setSessionCookie(sessionToken: string, expires: Date): Promise<void> {
  const cookie = sessionCookie();
  const store = await cookies();
  store.set(cookie.name, sessionToken, { ...cookie.options, expires });
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
