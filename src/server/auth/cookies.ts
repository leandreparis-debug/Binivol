/**
 * Session cookie names, shared by Auth.js, the demo sign-in and the
 * middleware. Edge-safe: no database import here.
 *
 * The cookie is `Secure` (and `__Secure-` prefixed) whenever the app is served
 * over HTTPS, i.e. always in production except an explicit `http://` AUTH_URL
 * (local production build used by the e2e tests).
 */
export const SESSION_COOKIE_BASE = "authjs.session-token";
export const SECURE_SESSION_COOKIE = `__Secure-${SESSION_COOKIE_BASE}`;
export const SESSION_COOKIE_NAMES = [SESSION_COOKIE_BASE, SECURE_SESSION_COOKIE] as const;

/** Session lifetime and renewal (Auth.js `database` strategy). */
export const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 60 * 60;

export function shouldUseSecureCookies(
  env: { NODE_ENV?: string; AUTH_URL?: string } = {
    NODE_ENV: process.env.NODE_ENV,
    AUTH_URL: process.env.AUTH_URL,
  },
): boolean {
  if (env.AUTH_URL?.startsWith("https://")) return true;
  if (env.AUTH_URL?.startsWith("http://")) return false;
  return env.NODE_ENV === "production";
}

export interface SessionCookie {
  name: string;
  options: { httpOnly: true; sameSite: "lax"; path: "/"; secure: boolean };
}

/** Name and options of the session cookie: HttpOnly, SameSite=Lax, Secure over HTTPS. */
export function sessionCookie(secure: boolean = shouldUseSecureCookies()): SessionCookie {
  return {
    name: secure ? SECURE_SESSION_COOKIE : SESSION_COOKIE_BASE,
    options: { httpOnly: true, sameSite: "lax", path: "/", secure },
  };
}
