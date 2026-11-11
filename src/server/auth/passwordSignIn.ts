import type { DbOrTx } from "../db";
import { hitRateLimit, isRateLimited, RATE_RULES, valueRateKey } from "../rateLimit";
import { recordLoginDenied } from "./events";
import { verifyAgainstDummy, verifyPassword } from "./password";
import { createUserSession } from "./session";
import { accountDenial, type SignInDenial } from "./signIn";

/**
 * Identifier + password sign-in (ADR-070).
 *
 * - The identifier is compared lower-cased; an unknown identifier, an account
 *   without password and a wrong password give the same answer
 *   (`bad_credentials`), in the same time (dummy argon2 verification).
 * - After `RATE_RULES.signInFailure.limit` failures in the window, the
 *   identifier is refused (`rate_limited`) without checking the password,
 *   whatever the client. The per-client limit is applied by the action.
 * - Deactivated accounts and accounts without profile are refused, and said so,
 *   only once the password is right.
 * - Every refusal writes LOGIN_DENIED (identifier and reason, never the
 *   password); a success creates the database session and writes LOGIN.
 */
export type PasswordSignInResult =
  | { ok: true; userId: string; sessionToken: string; expires: Date }
  | { ok: false; reason: SignInDenial };

export async function signInWithPassword(
  db: DbOrTx,
  input: { username: string; password: string },
  now: Date = new Date(),
): Promise<PasswordSignInResult> {
  const username = input.username.trim().toLowerCase();
  const failureKey = valueRateKey("signInFailure", username);

  const deny = async (reason: SignInDenial, userId?: string): Promise<PasswordSignInResult> => {
    await recordLoginDenied(db, { username: username.slice(0, 80), reason, userId });
    return { ok: false, reason };
  };

  if (await isRateLimited(db, failureKey, RATE_RULES.signInFailure, now)) {
    return deny("rate_limited");
  }

  const user =
    username === ""
      ? null
      : await db.user.findUnique({
          where: { username },
          select: {
            id: true,
            active: true,
            passwordHash: true,
            _count: { select: { profiles: true } },
          },
        });

  const valid = user?.passwordHash
    ? await verifyPassword(user.passwordHash, input.password)
    : (await verifyAgainstDummy(input.password), false);

  if (!user || !valid) {
    await hitRateLimit(db, failureKey, RATE_RULES.signInFailure, now);
    return deny("bad_credentials", user?.id);
  }

  const denial = accountDenial({
    id: user.id,
    active: user.active,
    profileCount: user._count.profiles,
  });
  if (denial) return deny(denial, user.id);

  const session = await createUserSession(db, user.id, "password", now);
  return { ok: true, userId: user.id, ...session };
}
