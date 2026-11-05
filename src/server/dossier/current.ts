import { cookies } from "next/headers";
import { shouldUseSecureCookies } from "../auth/cookies";
import type { Db } from "../db";
import { DomainError } from "../errors";
import { linkState, resolveDossierLink, type DossierSessionContext } from "../services/dossiers";
import { signingState } from "./store";
import {
  DOSSIER_COOKIE,
  dossierCookieOptions,
  openDossierSession,
  sealDossierSession,
} from "./session";

/**
 * The candidate behind the request, from the dossier cookie (`/dossier*`
 * only). Never reads a token: the token was exchanged for the cookie by
 * `openDossierAction` (`/dossier/ouvrir#<token>`).
 *
 * - `none`: no cookie, expired cookie, or a link revoked / expired since;
 * - `active`: the draft can be read and written;
 * - `signing`: the dossier was sent, the signatures are expected (the link
 *   only opens the signature screens, the form is read-only — ADR-045);
 * - `submitted`: the dossier is sent and signed (the link is used).
 */
export type CandidateSession =
  | { state: "none" }
  | { state: "submitted" }
  | { state: "active"; context: DossierSessionContext }
  | { state: "signing"; linkId: string; personId: string };

export async function candidateSession(db: Db, now = new Date()): Promise<CandidateSession> {
  const store = await cookies();
  const payload = openDossierSession(store.get(DOSSIER_COOKIE)?.value, now.getTime());
  if (!payload) return { state: "none" };
  const link = await db.dossierLink.findUnique({
    where: { id: payload.linkId },
    select: {
      id: true,
      personId: true,
      mode: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
    },
  });
  if (link?.mode !== "REMOTE") return { state: "none" };
  const state = linkState(link, now);
  if (state === "used") return { state: "submitted" };
  if (state !== "active") return { state: "none" };
  const context = await resolveDossierLink(db, link.id, now);
  if (context) return { state: "active", context };
  const signing = await signingState(db, link.personId);
  if (signing?.status === "SUBMITTED") {
    return { state: "signing", linkId: link.id, personId: link.personId };
  }
  return { state: "none" };
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

/** Removes the dossier cookie (refused link). Server Action only. */
export async function clearDossierCookie(): Promise<void> {
  const store = await cookies();
  store.set(DOSSIER_COOKIE, "", { ...dossierCookieOptions(shouldUseSecureCookies()), maxAge: 0 });
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
    throw new DomainError("INVALID_DATA", "Votre dossier a déjà été envoyé.");
  }
  if (session.state === "none") {
    throw new DomainError("DOSSIER_SESSION_EXPIRED", SESSION_EXPIRED_MESSAGE);
  }
  await setDossierCookie(session.context.linkId);
  return session.context;
}

/**
 * The candidate of a signature action: a link still open and a sent dossier
 * waiting for its signatures. Cookie renewed.
 */
export async function requireSigningCandidate(
  db: Db,
): Promise<{ linkId: string; personId: string }> {
  const session = await candidateSession(db);
  if (session.state === "submitted") {
    throw new DomainError("INVALID_DATA", "Ton dossier est déjà signé. Merci !");
  }
  if (session.state !== "signing") {
    throw new DomainError("DOSSIER_SESSION_EXPIRED", SESSION_EXPIRED_MESSAGE);
  }
  await setDossierCookie(session.linkId);
  return { linkId: session.linkId, personId: session.personId };
}
