import { createHash, randomBytes } from "node:crypto";

/**
 * Dossier link tokens: 32 random bytes in base64url. Only the SHA-256 of the
 * token is stored (`DossierLink.tokenHash`); the token itself exists once, in
 * the link handed to the candidate.
 */
export function newDossierToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashDossierToken(token) };
}

export function hashDossierToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** A token as produced by `newDossierToken` (43 base64url characters). */
export function looksLikeDossierToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * The address of a dossier link. The token is in the **fragment** (after `#`):
 * browsers never send it to the server, so it reaches no access log; the
 * `/dossier/ouvrir` page posts it to the exchange action (ADR-043).
 */
export function dossierLinkUrl(baseUrl: string, token: string): string {
  return `${baseUrl.replace(/\/$/, "")}/dossier/ouvrir#${token}`;
}
