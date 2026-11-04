import { withAudit } from "../audit";
import type { DbOrTx } from "../db";
import type { SignInDenial } from "./signIn";

/**
 * Sign-in journal. Entries go to `audit_logs` (append-only) with the entity
 * `User`. Never a token, never a password: only the address and the reason.
 */

/** Successful sign-in: updates `lastLoginAt` and writes LOGIN, in one transaction. */
export async function recordLogin(
  db: DbOrTx,
  userId: string,
  method: "google" | "demo",
): Promise<void> {
  await withAudit(db, { userId, label: "Connexion" }, async (tx, audit) => {
    await tx.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
    audit.log({ action: "LOGIN", entity: "User", entityId: userId, newValue: { method } });
  });
}

/** Refused sign-in: writes LOGIN_DENIED with the address and the reason. */
export async function recordLoginDenied(
  db: DbOrTx,
  denial: { email: string | null; reason: SignInDenial; userId?: string },
): Promise<void> {
  await withAudit(db, { userId: null, label: "Connexion" }, (_tx, audit) => {
    audit.log({
      action: "LOGIN_DENIED",
      entity: "User",
      entityId: denial.userId ?? null,
      newValue: { email: denial.email, reason: denial.reason },
    });
    return Promise.resolve();
  });
}

/** Sign-out: writes LOGOUT. */
export async function recordLogout(db: DbOrTx, userId: string): Promise<void> {
  await withAudit(db, { userId, label: "Connexion" }, (_tx, audit) => {
    audit.log({ action: "LOGOUT", entity: "User", entityId: userId });
    return Promise.resolve();
  });
}
