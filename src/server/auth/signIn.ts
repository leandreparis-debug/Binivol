/**
 * Sign-in rules, as pure functions so they can be tested without a database.
 * Used by the password sign-in (`passwordSignIn.ts`) and the demo sign-in.
 */

export type SignInDenial =
  "domain" | "unknown" | "inactive" | "no_profile" | "bad_credentials" | "rate_limited";

export interface SignInIdentity {
  /** Address of the account (demo sign-in). */
  email: string | null | undefined;
  /** Whether the address is trusted (always true for the demo seed accounts). */
  emailVerified: boolean;
}

export interface KnownUser {
  id: string;
  active: boolean;
  profileCount: number;
}

export type SignInDecision =
  | { ok: true; email: string; userId: string }
  | { ok: false; email: string | null; reason: SignInDenial; userId?: string };

/** Lower-cased, trimmed address, or null. */
export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  return value === "" ? null : value;
}

/** True when the (normalised) address belongs to the domain, exactly. */
export function isEmailInDomain(email: string, domain: string): boolean {
  return (
    email.endsWith(`@${domain.toLowerCase()}`) && email.indexOf("@") === email.lastIndexOf("@")
  );
}

/**
 * Applies, in this order: verified address, allowed domain, known account,
 * active account with at least one profile. Returns the first refusal.
 * An unknown address is refused, never created.
 */
export function evaluateSignIn(
  identity: SignInIdentity,
  user: KnownUser | null,
  allowedDomain: string,
): SignInDecision {
  const email = normalizeEmail(identity.email);
  if (!identity.emailVerified || email === null) return { ok: false, email, reason: "domain" };
  if (!isEmailInDomain(email, allowedDomain)) return { ok: false, email, reason: "domain" };
  if (!user) return { ok: false, email, reason: "unknown" };
  const denial = accountDenial(user);
  if (denial) return { ok: false, email, reason: denial, userId: user.id };
  return { ok: true, email, userId: user.id };
}

/** Active account with at least one profile: the checks shared by every sign-in. */
export function accountDenial(user: KnownUser): "inactive" | "no_profile" | null {
  if (!user.active) return "inactive";
  if (user.profileCount === 0) return "no_profile";
  return null;
}

/** French message of each refusal, shown on /connexion. */
export const SIGN_IN_DENIAL_MESSAGES: Record<SignInDenial, string> = {
  domain: "Ce compte ne peut pas se connecter ici.",
  unknown: "Ce compte n'a pas encore accès à Binivol. Demandez-le au DLUS.",
  inactive: "Ce compte est désactivé. Contactez le DLUS.",
  no_profile: "Ce compte est désactivé. Contactez le DLUS.",
  bad_credentials: "Identifiant ou mot de passe incorrect.",
  rate_limited: "Trop de tentatives en peu de temps. Réessayez dans quelques minutes.",
};

export const GENERIC_SIGN_IN_ERROR = "La connexion a échoué. Réessayez ou contactez le DLUS.";

/** Message for the `error` query parameter of /connexion (ours or Auth.js's). */
export function signInErrorMessage(error: string | null | undefined): string | null {
  if (!error) return null;
  if (error in SIGN_IN_DENIAL_MESSAGES) return SIGN_IN_DENIAL_MESSAGES[error as SignInDenial];
  return GENERIC_SIGN_IN_ERROR;
}
