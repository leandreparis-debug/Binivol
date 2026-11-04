import NextAuth, { type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import { getEnv, isGoogleConfigured } from "@/lib/env";
import { getDb } from "../db";
import { createAdapter } from "./adapter";
import { SESSION_MAX_AGE_SECONDS, SESSION_UPDATE_AGE_SECONDS, sessionCookie } from "./cookies";
import { recordLogin, recordLoginDenied, recordLogout } from "./events";
import { handleSignIn } from "./signIn";

/**
 * Auth.js configuration. Built lazily (per request) so that importing this
 * module never needs a database, e.g. during `next build`.
 *
 * - Google only (the demo sign-in is not an Auth.js provider, see `demo.ts`);
 * - database sessions: 12 h, renewed after one hour of activity;
 * - the `signIn` callback re-checks domain, account, activity and profiles.
 */
export function buildAuthConfig(): NextAuthConfig {
  const env = getEnv();
  const db = getDb();
  const cookie = sessionCookie();
  const domain = env.AUTH_ALLOWED_DOMAIN;

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
    providers: isGoogleConfigured(env)
      ? [
          Google({
            clientId: env.AUTH_GOOGLE_ID,
            clientSecret: env.AUTH_GOOGLE_SECRET,
            // The account is pre-created by TOPAZE and the address is checked
            // (verified, domain) in `signIn`: linking by e-mail is safe here.
            allowDangerousEmailAccountLinking: true,
            authorization: { params: { hd: domain, prompt: "select_account" } },
          }),
        ]
      : [],
    callbacks: {
      async signIn({ user, profile }) {
        const emailVerified = profile?.email_verified === true;
        return handleSignIn({ email: profile?.email ?? user.email, emailVerified }, domain, {
          async findUser(email) {
            const found = await db.user.findUnique({
              where: { email },
              select: { id: true, active: true, _count: { select: { profiles: true } } },
            });
            return found
              ? { id: found.id, active: found.active, profileCount: found._count.profiles }
              : null;
          },
          recordDenied: (denial) => recordLoginDenied(db, denial),
        });
      },
      /** Only the id, name and e-mail reach the client; profiles are re-read server side. */
      session({ session, user }) {
        return {
          ...session,
          user: { id: user.id, name: user.name ?? "", email: user.email },
        };
      },
    },
    events: {
      async signIn({ user }) {
        if (user.id) await recordLogin(db, user.id, "google");
      },
      async signOut(message) {
        const userId = "session" in message ? message.session?.userId : undefined;
        if (userId) await recordLogout(db, userId);
      },
    },
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth(() => buildAuthConfig());
