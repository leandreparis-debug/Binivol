import { cookies } from "next/headers";
import { shouldUseSecureCookies } from "../auth/cookies";
import type { Db } from "../db";
import { DomainError } from "../errors";
import {
  linkState,
  resolveDossierLink,
  resolveSigningLink,
  type DossierSessionContext,
  type SigningSessionContext,
} from "../services/dossiers";
import {
  DOSSIER_COOKIE,
  dossierCookieOptions,
  openDossierSession,
  sealDossierSession,
} from "./session";

/**
 * The candidate behind the request, from the dossier cookie (`/dossier*`
 * only). Never reads a token: the token was exchanged for the cookie by
 * `/dossier/ouvrir`.
 *
 * - `none`: no cookie, expired cookie, or a link revoked / expired since;
 * - `active`: the draft can be read and written;
 * - `signing`: the dossier is sent and waits for its signatures (the form is
 *   closed, the link only opens the signature screens, ADR-044);
 * - `submitted`: the dossier is signed (the link is used).
 */
export type CandidateSession =
  | { state: "none" }
  | { state: "submitted" }
  | { state: "active"; context: DossierSessionContext }
  | { state: "signing"; context: SigningSessionContext };

export async function candidateSession(db: Db, now = new Date()): Promise<CandidateSession> {
  const store = await cookies();
  const payload = openDossierSession(store.get(DOSSIER_COOKIE)?.value, now.getTime());
  if (!payload) return { state: "none" };
  const context = await resolveDossierLink(db, payload.linkId, now);
  if (context?.mode === "REMOTE") return { state: "active", context };
  const signing = await resolveSigningLink(db, payload.linkId, now);
  if (signing?.mode === "REMOTE") return { state: "signing", context: signing };
  const link = await db.dossierLink.findUnique({
    where: { id: payload.linkId },
    select: { expiresAt: true, usedAt: true, revokedAt: true },
  });
  return link && linkState(link, now) === "used" ? { state: "submitted" } : { state: "none" };
}

/** Renews the dossier cookie (2 h sliding). Server Action only. */
export async function setDossierCookie(linkId: string): Promise<void> {
  const store = await cookies();
  store.set(
    DOSSIER_COOKIE,
    sealDossierSession(linkId),
    dossierCookieOptions(shouldUseSecureCookies()),
  );
}

export const SESSION_EXPIRED_MESSAGE =
  "Votre session a expiré ou ce lien n'est plus valable. Rouvrez le lien reçu par e-mail, ou contactez l'unité locale.";

/**
 * The active candidate of a Server Action, with the cookie renewed. Throws a
 * clear error otherwise (the form keeps what was typed on the screen).
 */
export async function requireCandidate(db: Db): Promise<DossierSessionContext> {
  const session = await candidateSession(db);
  if (session.state === "submitted" || session.state === "signing") {
    throw new DomainError(
      "INVALID_DATA",
      "Votre dossier a déjà été envoyé : il ne se modifie plus.",
    );
  }
  if (session.state === "none") {
    throw new DomainError("DOSSIER_SESSION_EXPIRED", SESSION_EXPIRED_MESSAGE);
  }
  await setDossierCookie(session.context.linkId);
  return session.context;
}

/** The candidate of a signature action (dossier sent, not signed yet), cookie renewed. */
export async function requireSigningCandidate(db: Db): Promise<SigningSessionContext> {
  const session = await candidateSession(db);
  if (session.state === "submitted") {
    throw new DomainError("SIGNATURE_STATE", "Ton dossier est déjà signé.");
  }
  if (session.state !== "signing") {
    throw new DomainError("DOSSIER_SESSION_EXPIRED", SESSION_EXPIRED_MESSAGE);
  }
  await setDossierCookie(session.context.linkId);
  return session.context;
}
