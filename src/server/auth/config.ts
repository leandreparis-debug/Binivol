import NextAuth, { type NextAuthConfig } from "next-auth";
import { getEnv } from "@/lib/env";
import { getDb } from "../db";
import { createAdapter } from "./adapter";
import { SESSION_MAX_AGE_SECONDS, SESSION_UPDATE_AGE_SECONDS, sessionCookie } from "./cookies";
import { recordLogout } from "./events";

/**
 * Auth.js configuration. Built lazily (per request) so that importing this
 * module never needs a database, e.g. during `next build`.
 *
 * - no provider: Auth.js only reads, renews and closes the database sessions
 *   (12 h, renewed after one hour of activity). They are created by the
 *   password sign-in and the demo sign-in (`session.ts`, ADR-070), because
 *   Auth.js credentials providers cannot use database sessions.
 */
export function buildAuthConfig(): NextAuthConfig {
  const env = getEnv();
  const db = getDb();
  const cookie = sessionCookie();

  return {
    adapter: createAdapter(db),
    secret: env.AUTH_SECRET,
    trustHost: true,
    session: {
      strategy: "database",
      maxAge: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    useSecureCookies: cookie.options.secure,
    cookies: { sessionToken: { name: cookie.name, options: cookie.options } },
    pages: { signIn: "/connexion", error: "/connexion" },
    providers: [],
    callbacks: {
      /** Only the id, name and e-mail reach the client; profiles are re-read server side. */
      session({ session, user }) {
        return {
          ...session,
          user: { id: user.id, name: user.name ?? "", email: user.email },
        };
      },
    },
    events: {
      async signOut(message) {
        const userId = "session" in message ? message.session?.userId : undefined;
        if (userId) await recordLogout(db, userId);
      },
    },
  };
}

export const { handlers, auth, signOut } = NextAuth(() => buildAuthConfig());
