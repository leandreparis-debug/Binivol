import { createHmac, timingSafeEqual } from "node:crypto";
import { derivedKey } from "../secrets";

/**
 * The dossier session: once the link is checked, the token is exchanged for
 * a signed cookie (HMAC-SHA256) holding the link id and an expiry, valid 2 h
 * and renewed on each request (sliding). The token never stays in the URL,
 * the history or the logs.
 */
export const DOSSIER_COOKIE = "binivol_dossier";
export const DOSSIER_COOKIE_PATH = "/dossier";
export const DOSSIER_SESSION_SECONDS = 2 * 60 * 60;

export interface DossierSessionPayload {
  linkId: string;
  /** Expiry, milliseconds since epoch. */
  exp: number;
}

function sign(body: string): string {
  return createHmac("sha256", derivedKey("dossier-session")).update(body).digest("base64url");
}

export function sealDossierSession(linkId: string, now = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ linkId, exp: now + DOSSIER_SESSION_SECONDS * 1000 }),
  ).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The payload of a valid, unexpired cookie, or null. */
export function openDossierSession(
  value: string | undefined,
  now = Date.now(),
): DossierSessionPayload | null {
  if (!value) return null;
  const [body, signature] = value.split(".");
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(body, "base64url").toString("utf8"),
    ) as Partial<DossierSessionPayload>;
    if (typeof payload.linkId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= now) return null;
    return { linkId: payload.linkId, exp: payload.exp };
  } catch {
    return null;
  }
}

/** Cookie options: HttpOnly, SameSite=Lax, limited to /dossier, Secure over HTTPS. */
export function dossierCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: DOSSIER_COOKIE_PATH,
    secure,
    maxAge: DOSSIER_SESSION_SECONDS,
  };
}
