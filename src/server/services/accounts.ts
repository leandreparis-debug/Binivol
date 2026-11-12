import type { Profile } from "@/generated/prisma/enums";
import { withAudit, type Actor as AuditActor } from "../audit";
import { releaseTodosOfUser } from "./todos";
import type { DbOrTx, Tx } from "../db";
import { DomainError } from "../errors";
import { authorize } from "../policy/can";
import type { Actor } from "../policy/types";
import { USERNAME_HINT } from "@/lib/username";
import { normalizeUsername } from "../auth/credentials";
import { normalizeEmail } from "../auth/signIn";

/**
 * Management of responsible accounts (TOPAZE screen and `pnpm admin:*`).
 * Authorisation (`user.manage`) is checked by the caller; this module holds
 * the business guards:
 * - an account is never deleted, only deactivated;
 * - the last active TOPAZE can be neither deactivated nor lose TOPAZE;
 * - nobody removes TOPAZE from themselves nor deactivates themselves;
 * - deactivating an account deletes its sessions (immediate sign-out);
 * - every change is audited (before and after).
 */

export const PROFILE_ORDER: readonly Profile[] = [
  "TOPAZE",
  "ACTION",
  "LASER",
  "FORMAT",
  "FORMAT_GP",
  "DIAMANT",
];

export interface AccountRow {
  id: string;
  email: string;
  name: string;
  /** Sign-in identifier; null until the invitation is used (unless fixed). */
  username: string | null;
  /** False until a password is chosen through an access link. */
  hasPassword: boolean;
  active: boolean;
  lastLoginAt: Date | null;
  profiles: Profile[];
}

const sortProfiles = (profiles: Iterable<Profile>) =>
  [...new Set(profiles)].sort((a, b) => PROFILE_ORDER.indexOf(a) - PROFILE_ORDER.indexOf(b));

/** Serialises the guard checks on TOPAZE accounts across concurrent transactions. */
async function lockTopaze(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('binivol:topaze-accounts'))`;
}

async function otherActiveTopaze(tx: Tx, userId: string): Promise<number> {
  return tx.user.count({
    where: { id: { not: userId }, active: true, profiles: { some: { profile: "TOPAZE" } } },
  });
}

/** Columns of an account row: never the password hash, only whether one is set. */
const accountSelect = {
  id: true,
  email: true,
  name: true,
  username: true,
  passwordChangedAt: true,
  active: true,
  lastLoginAt: true,
  profiles: { select: { profile: true } },
} as const;

function toAccountRow(user: {
  id: string;
  email: string;
  name: string;
  username: string | null;
  passwordChangedAt: Date | null;
  active: boolean;
  lastLoginAt: Date | null;
  profiles: { profile: Profile }[];
}): AccountRow {
  const { passwordChangedAt, profiles, ...rest } = user;
  return {
    ...rest,
    hasPassword: passwordChangedAt !== null,
    profiles: sortProfiles(profiles.map((p) => p.profile)),
  };
}

async function loadAccount(tx: Tx, userId: string): Promise<AccountRow> {
  const user = await tx.user.findUnique({ where: { id: userId }, select: accountSelect });
  if (!user) throw new DomainError("ACCOUNT_NOT_FOUND", "Compte introuvable.");
  return toAccountRow(user);
}

/** Lists every account, active first, then by name. */
export async function listAccounts(db: DbOrTx): Promise<AccountRow[]> {
  const users = await db.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: accountSelect,
  });
  return users.map(toAccountRow);
}

/** Normalised address; any domain is accepted since ADR-070. */
function checkEmail(email: string): string {
  const normalized = normalizeEmail(email);
  if (!normalized || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new DomainError("INVALID_EMAIL", "Adresse e-mail invalide.");
  }
  return normalized;
}

/** Normalised identifier, or a clear refusal. */
export function checkUsername(value: string): string {
  const username = normalizeUsername(value);
  if (!username) {
    throw new DomainError(
      "INVALID_USERNAME",
      `Identifiant invalide : ${USERNAME_HINT.charAt(0).toLowerCase()}${USERNAME_HINT.slice(1)}`,
    );
  }
  return username;
}

/** Refuses an identifier already used by another account. */
export async function assertUsernameFree(tx: DbOrTx, username: string): Promise<void> {
  if (await tx.user.findUnique({ where: { username }, select: { id: true } })) {
    throw new DomainError(
      "USERNAME_TAKEN",
      "Cet identifiant est déjà utilisé. Choisissez-en un autre.",
    );
  }
}

/**
 * Creates an account with at least one profile, and no password: it gets one
 * through an invitation link (`accountAccess.ts`). The identifier may be fixed
 * now, or left to the person.
 */
export async function createAccount(
  db: DbOrTx,
  actor: AuditActor,
  input: { email: string; name: string; profiles: Profile[]; username?: string | null },
): Promise<AccountRow> {
  const email = checkEmail(input.email);
  const username =
    input.username && input.username.trim() !== "" ? checkUsername(input.username) : null;
  const profiles = sortProfiles(input.profiles);
  if (profiles.length === 0) throw new DomainError("NO_PROFILE", "Cochez au moins un profil.");
  return withAudit(db, actor, async (tx, audit) => {
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new DomainError("EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.");
    }
    if (username) await assertUsernameFree(tx, username);
    const user = await tx.user.create({
      data: {
        email,
        username,
        name: input.name.trim() !== "" ? input.name.trim() : (email.split("@")[0] ?? email),
        active: true,
        createdById: actor.userId,
        updatedById: actor.userId,
        profiles: { create: profiles.map((profile) => ({ profile })) },
      },
      select: { id: true, email: true, username: true, name: true, active: true },
    });
    audit.created("User", user.id, { ...user, profiles });
    return loadAccount(tx, user.id);
  });
}

/** Replaces the profiles of an account, with the TOPAZE guards. */
export async function setProfiles(
  db: DbOrTx,
  actor: AuditActor,
  input: { userId: string; profiles: Profile[] },
): Promise<AccountRow> {
  const profiles = sortProfiles(input.profiles);
  return withAudit(db, actor, async (tx, audit) => {
    await lockTopaze(tx);
    const before = await loadAccount(tx, input.userId);
    const losesTopaze = before.profiles.includes("TOPAZE") && !profiles.includes("TOPAZE");
    if (losesTopaze && actor.userId === input.userId) {
      throw new DomainError(
        "SELF_TOPAZE_REMOVAL",
        "Vous ne pouvez pas retirer votre propre profil TOPAZE.",
      );
    }
    if (losesTopaze && before.active && (await otherActiveTopaze(tx, input.userId)) === 0) {
      throw new DomainError("LAST_TOPAZE", "Impossible : c'est le dernier compte TOPAZE actif.");
    }
    await tx.userProfile.deleteMany({
      where: { userId: input.userId, profile: { notIn: profiles } },
    });
    await tx.userProfile.createMany({
      data: profiles.map((profile) => ({ userId: input.userId, profile })),
      skipDuplicates: true,
    });
    await tx.user.update({ where: { id: input.userId }, data: { updatedById: actor.userId } });
    const after = await loadAccount(tx, input.userId);
    audit.updated(
      "User",
      input.userId,
      { profiles: before.profiles },
      { profiles: after.profiles },
    );
    return after;
  });
}

/** Deactivates (and signs out) or reactivates an account, with the TOPAZE guards. */
export async function setActive(
  db: DbOrTx,
  actor: AuditActor,
  input: { userId: string; active: boolean },
): Promise<AccountRow> {
  return withAudit(db, actor, async (tx, audit) => {
    await lockTopaze(tx);
    const before = await loadAccount(tx, input.userId);
    if (before.active === input.active) return before;
    if (!input.active) {
      if (actor.userId === input.userId) {
        throw new DomainError(
          "SELF_DEACTIVATION",
          "Vous ne pouvez pas désactiver votre propre compte.",
        );
      }
      if (before.profiles.includes("TOPAZE") && (await otherActiveTopaze(tx, input.userId)) === 0) {
        throw new DomainError("LAST_TOPAZE", "Impossible : c'est le dernier compte TOPAZE actif.");
      }
      // Technical rows: deleting them signs the account out everywhere, now.
      await tx.session.deleteMany({ where: { userId: input.userId } });
      // « À faire »: her assignments go, her projects keep an OWNER (step 16).
      await releaseTodosOfUser(tx, audit, input.userId);
    }
    await tx.user.update({
      where: { id: input.userId },
      data: { active: input.active, updatedById: actor.userId },
    });
    audit.updated("User", input.userId, { active: before.active }, { active: input.active });
    return loadAccount(tx, input.userId);
  });
}

/**
 * `pnpm admin:grant`: creates the account if needed, sets exactly these
 * profiles and activates it. Same guards as the screen.
 */
export async function grantAccount(
  db: DbOrTx,
  actor: AuditActor,
  input: { email: string; profiles: Profile[]; name?: string; username?: string | null },
): Promise<{ account: AccountRow; created: boolean }> {
  const email = checkEmail(input.email);
  const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!existing) {
    return {
      account: await createAccount(db, actor, {
        email,
        name: input.name ?? "",
        profiles: input.profiles,
        username: input.username,
      }),
      created: true,
    };
  }
  if (input.profiles.length === 0)
    throw new DomainError("NO_PROFILE", "Indiquez au moins un profil.");
  await setActive(db, actor, { userId: existing.id, active: true });
  return {
    account: await setProfiles(db, actor, { userId: existing.id, profiles: input.profiles }),
    created: false,
  };
}

/** `pnpm admin:revoke`: deactivates the account (never deletes it). */
export async function revokeAccount(
  db: DbOrTx,
  actor: AuditActor,
  email: string,
): Promise<AccountRow> {
  const normalized = normalizeEmail(email);
  const existing = normalized
    ? await db.user.findUnique({ where: { email: normalized }, select: { id: true } })
    : null;
  if (!existing) throw new DomainError("ACCOUNT_NOT_FOUND", "Compte introuvable.");
  return setActive(db, actor, { userId: existing.id, active: false });
}

/** Names of the accounts, for the filters of the logs (step 14, TOPAZE). */
export async function listUserNames(
  db: DbOrTx,
  actor: Actor,
): Promise<{ id: string; name: string }[]> {
  authorize(actor, "audit.read");
  return db.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}
