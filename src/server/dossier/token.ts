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
