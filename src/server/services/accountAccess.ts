import type { AccountTokenPurpose, Profile } from "@/generated/prisma/enums";
import { withAudit, type Actor as AuditActor } from "../audit";
import {
  ACCESS_LINK_TTL_HOURS,
  accessLinkUrl,
  hashAccessToken,
  looksLikeAccessToken,
  newAccessToken,
} from "../auth/credentials";
import { hashPassword, passwordProblem } from "../auth/password";
import type { DbOrTx } from "../db";
import { DomainError, translateDbError } from "../errors";
import { getMail, MailUnavailableError, type MailService } from "../mail";
import { accessLinkMail } from "../mail/templates";
import { dossierSettings } from "../settings";
import { assertUsernameFree, checkUsername, createAccount, type AccountRow } from "./accounts";

/**
 * Access links of responsible accounts (ADR-070): invitation (first access)
 * and new password, both issued by TOPAZE (screen or `pnpm admin:grant`).
 *
 * - one token = 32 random bytes; only its SHA-256 is stored, never the token;
 * - single use and time-limited (`ACCESS_LINK_TTL_HOURS`); issuing a link
 *   revokes the previous unused links of the account;
 * - using it is atomic (conditional update): a link works once, even when two
 *   requests race; a refused password or identifier does not consume it;
 * - setting a password closes every session of the account;
 * - everything is audited, without token, hash or password.
 */

export interface IssuedLink {
  url: string;
  expiresAt: Date;
  purpose: AccountTokenPurpose;
  /** True when the link was also sent by e-mail (MAIL_DRIVER=smtp). */
  mailed: boolean;
  /** Why the e-mail could not be sent, when it was tried. */
  mailError?: string;
}

export interface LinkOptions {
  baseUrl: string;
  now?: Date;
  /** Sends the link by e-mail when the driver is `smtp` (default: the configured driver). */
  mail?: MailService | null;
}

/** Creates a new link for the account, revoking the previous unused ones. */
async function issueLink(
  db: DbOrTx,
  actor: AuditActor,
  userId: string,
  purpose: AccountTokenPurpose,
  options: LinkOptions,
): Promise<IssuedLink> {
  const now = options.now ?? new Date();
  const { token, tokenHash } = newAccessToken();
  const expiresAt = new Date(now.getTime() + ACCESS_LINK_TTL_HOURS[purpose] * 3600 * 1000);
  const user = await withAudit(db, actor, async (tx, audit) => {
    const found = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, active: true },
    });
    if (!found) throw new DomainError("ACCOUNT_NOT_FOUND", "Compte introuvable.");
    if (!found.active) {
      throw new DomainError("ACCOUNT_INACTIVE", "Réactivez d'abord ce compte.");
    }
    const revoked = await tx.accountToken.updateMany({
      where: { userId, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const created = await tx.accountToken.create({
      data: { userId, purpose, tokenHash, expiresAt, createdAt: now, createdById: actor.userId },
      select: { id: true },
    });
    audit.created("AccountToken", created.id, {
      userId,
      purpose,
      tokenHash,
      expiresAt,
      revokedPrevious: revoked.count,
    });
    return found;
  });

  const url = accessLinkUrl(options.baseUrl, token);
  const mail = options.mail === undefined ? getMail(db, actor.userId) : options.mail;
  if (mail?.driver !== "smtp") return { url, expiresAt, purpose, mailed: false };
  try {
    const { ulName } = await dossierSettings(db);
    await mail.send({
      to: user.email,
      ...accessLinkMail({ name: user.name, url, ulName, purpose, expiresAt }),
    });
    return { url, expiresAt, purpose, mailed: true };
  } catch (error) {
    if (error instanceof MailUnavailableError) {
      return { url, expiresAt, purpose, mailed: false, mailError: error.message };
    }
    throw error;
  }
}

/** TOPAZE invites a responsible: the account (no password yet) and its invitation link. */
export async function inviteAccount(
  db: DbOrTx,
  actor: AuditActor,
  input: { email: string; name: string; profiles: Profile[]; username?: string | null },
  options: LinkOptions,
): Promise<{ account: AccountRow; link: IssuedLink }> {
  const account = await createAccount(db, actor, input);
  const link = await issueLink(db, actor, account.id, "INVITE", options);
  return { account, link };
}

/**
 * A new link for an existing account: an invitation again while no password
 * was chosen, a new-password link afterwards. The current password keeps
 * working until the link is used.
 */
export async function issueAccessLink(
  db: DbOrTx,
  actor: AuditActor,
  userId: string,
  options: LinkOptions,
): Promise<IssuedLink> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { passwordChangedAt: true },
  });
  if (!user) throw new DomainError("ACCOUNT_NOT_FOUND", "Compte introuvable.");
  return issueLink(db, actor, userId, user.passwordChangedAt ? "RESET" : "INVITE", options);
}

export type AccessLinkView =
  | {
      ok: true;
      purpose: AccountTokenPurpose;
      name: string;
      /** Fixed identifier, or null when the person chooses it. */
      username: string | null;
      expiresAt: Date;
    }
  | { ok: false };

async function findUsableLink(db: DbOrTx, token: string, now: Date) {
  if (!looksLikeAccessToken(token)) return null;
  const link = await db.accountToken.findUnique({
    where: { tokenHash: hashAccessToken(token) },
    select: {
      id: true,
      purpose: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
      user: { select: { id: true, name: true, username: true, active: true } },
    },
  });
  if (!link || link.usedAt || link.revokedAt || link.expiresAt <= now || !link.user.active) {
    return null;
  }
  return link;
}

/**
 * What the `/acces` page shows. Unknown, expired, used, revoked or for a
 * deactivated account: `{ ok: false }`, without saying which.
 */
export async function inspectAccessLink(
  db: DbOrTx,
  token: string,
  now: Date = new Date(),
): Promise<AccessLinkView> {
  const link = await findUsableLink(db, token, now);
  if (!link) return { ok: false };
  return {
    ok: true,
    purpose: link.purpose,
    name: link.user.name,
    username: link.user.username,
    expiresAt: link.expiresAt,
  };
}

export const INVALID_LINK_MESSAGE =
  "Ce lien n'est plus valable (déjà utilisé, expiré ou remplacé). Demandez-en un nouveau au DLUS.";

/**
 * Uses a link: sets the identifier (when not fixed) and the password, closes
 * the sessions of the account and consumes the link, in one transaction.
 * Returns the identifier to sign in with.
 */
export async function completeAccessLink(
  db: DbOrTx,
  input: { token: string; username?: string | null; password: string },
  now: Date = new Date(),
): Promise<{ username: string }> {
  const link = await findUsableLink(db, input.token, now);
  if (!link) throw new DomainError("INVALID_LINK", INVALID_LINK_MESSAGE);

  const username = link.user.username ?? checkUsername(input.username ?? "");
  const problem = passwordProblem(input.password, username);
  if (problem) throw new DomainError("WEAK_PASSWORD", problem);
  const passwordHash = await hashPassword(input.password);
  const userId = link.user.id;

  await withAudit(db, { userId, label: "Lien d'accès" }, async (tx, audit) => {
    // Atomic consumption: only one request can turn `usedAt` from null.
    const consumed = await tx.accountToken.updateMany({
      where: { id: link.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (consumed.count !== 1) throw new DomainError("INVALID_LINK", INVALID_LINK_MESSAGE);
    if (!link.user.username) await assertUsernameFree(tx, username);
    await tx.user.update({
      where: { id: userId },
      data: { username, passwordHash, passwordChangedAt: now, updatedById: userId },
    });
    // A new password signs the account out everywhere.
    await tx.session.deleteMany({ where: { userId } });
    if (!link.user.username) {
      audit.updated("User", userId, { username: null }, { username });
    }
    audit.log({
      action: "UPDATE",
      entity: "User",
      entityId: userId,
      field: "password",
      newValue: link.purpose === "INVITE" ? "défini (invitation)" : "changé (lien)",
    });
    audit.log({
      action: "UPDATE",
      entity: "AccountToken",
      entityId: link.id,
      field: "usedAt",
      newValue: now.toISOString(),
    });
  }).catch((error: unknown) => {
    throw translateDbError(error);
  });
  return { username };
}
