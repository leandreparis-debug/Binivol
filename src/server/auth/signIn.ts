/**
 * Sign-in rules, as a pure function so they can be tested without network.
 * Google's `hd` parameter is only a hint: every check is done here.
 */

export type SignInDenial = "domain" | "unknown" | "inactive" | "no_profile";

export interface SignInIdentity {
  /** Address returned by the identity provider. */
  email: string | null | undefined;
  /** `email_verified` claim of the provider (Google). */
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
  if (!user.active) return { ok: false, email, reason: "inactive", userId: user.id };
  if (user.profileCount === 0) return { ok: false, email, reason: "no_profile", userId: user.id };
  return { ok: true, email, userId: user.id };
}

/** French message of each refusal, shown on /connexion. */
export const SIGN_IN_DENIAL_MESSAGES: Record<SignInDenial, string> = {
  domain: "Utilisez votre adresse @croix-rouge.fr.",
  unknown: "Ce compte n'a pas encore accès à Binivol. Demandez-le au DLUS.",
  inactive: "Ce compte est désactivé. Contactez le DLUS.",
  no_profile: "Ce compte est désactivé. Contactez le DLUS.",
};

export const GENERIC_SIGN_IN_ERROR = "La connexion a échoué. Réessayez ou contactez le DLUS.";

/** Message for the `error` query parameter of /connexion (ours or Auth.js's). */
export function signInErrorMessage(
  error: string | null | undefined,
  allowedDomain = "croix-rouge.fr",
): string | null {
  if (!error) return null;
  if (error === "domain") return `Utilisez votre adresse @${allowedDomain}.`;
  if (error in SIGN_IN_DENIAL_MESSAGES) return SIGN_IN_DENIAL_MESSAGES[error as SignInDenial];
  return GENERIC_SIGN_IN_ERROR;
}

export interface SignInDeps {
  findUser(email: string): Promise<KnownUser | null>;
  recordDenied(decision: Extract<SignInDecision, { ok: false }>): Promise<void>;
}

/**
 * The `signIn` callback logic: evaluates the identity, journals a refusal
 * (address and reason, never a token) and returns `true` or the URL of the
 * sign-in page with the reason.
 */
export async function handleSignIn(
  identity: SignInIdentity,
  allowedDomain: string,
  deps: SignInDeps,
): Promise<true | string> {
  const email = normalizeEmail(identity.email);
  const user =
    email && identity.emailVerified && isEmailInDomain(email, allowedDomain)
      ? await deps.findUser(email)
      : null;
  const decision = evaluateSignIn(identity, user, allowedDomain);
  if (decision.ok) return true;
  await deps.recordDenied(decision);
  return `/connexion?error=${decision.reason}`;
}
