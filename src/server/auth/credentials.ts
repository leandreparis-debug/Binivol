import { createHash, randomBytes } from "node:crypto";
import { USERNAME_PATTERN } from "@/lib/username";

export { USERNAME_HINT, USERNAME_PATTERN } from "@/lib/username";

/**
 * Identifiers and access links (invitation, new password), ADR-070.
 * Pure helpers: no database, no native module.
 */

/** Lower-cased, trimmed identifier, or null when it does not follow the rule. */
export function normalizeUsername(value: string | null | undefined): string | null {
  const username = value?.trim().toLowerCase() ?? "";
  return USERNAME_PATTERN.test(username) ? username : null;
}

/** Lifetime of a link, per purpose. */
export const ACCESS_LINK_TTL_HOURS = { INVITE: 7 * 24, RESET: 24 } as const;

/**
 * Access link tokens: 32 random bytes in base64url. Only the SHA-256 is
 * stored (`AccountToken.tokenHash`); the token exists once, in the link.
 */
export function newAccessToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashAccessToken(token) };
}

export function hashAccessToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A token as produced by `newAccessToken` (43 base64url characters). */
export function looksLikeAccessToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * Address of an access link. The token is in the **fragment**: browsers never
 * send it to the server, so it reaches no access log (as ADR-043).
 */
export function accessLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/acces#${token}`;
}
