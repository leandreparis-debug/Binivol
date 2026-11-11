import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import type { DbOrTx } from "../db";
import { SESSION_MAX_AGE_SECONDS, sessionCookie } from "./cookies";
import { recordLogin } from "./events";

/**
 * Database sessions created by Binivol itself (password and demo sign-in).
 *
 * Auth.js credentials providers cannot use database sessions, so the session
 * row and cookie are written here, with exactly the name, lifetime and
 * options Auth.js uses: `auth()`, the renewal and the sign-out then work as
 * for any Auth.js session (docs/auth.md, ADR-070).
 */
export async function createUserSession(
  db: DbOrTx,
  userId: string,
  method: "password" | "demo",
  now = new Date(),
): Promise<{ sessionToken: string; expires: Date }> {
  const sessionToken = randomBytes(32).toString("base64url");
  const expires = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000);
  await db.session.create({ data: { sessionToken, userId, expires } });
  await recordLogin(db, userId, method);
  return { sessionToken, expires };
}

/** Sets the session cookie (to be called from a Server Action or Route Handler). */
export async function setSessionCookie(sessionToken: string, expires: Date): Promise<void> {
  const cookie = sessionCookie();
  const store = await cookies();
  store.set(cookie.name, sessionToken, { ...cookie.options, expires });
}
