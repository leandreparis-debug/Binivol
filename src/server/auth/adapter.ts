import type { Adapter, AdapterAccount, AdapterSession, AdapterUser } from "next-auth/adapters";
import type { DbOrTx } from "../db";
import { normalizeEmail } from "./signIn";

/**
 * Minimal Auth.js adapter for database sessions, on our Prisma 7 client.
 *
 * Why not `@auth/prisma-adapter`: it targets `@prisma/client` up to v6, creates
 * a `User` on first sign-in and stores every OAuth token. Here:
 * - `createUser` always throws: accounts are created by TOPAZE only;
 * - `linkAccount` keeps the provider identifiers, never the tokens;
 * - a session of an inactive or profile-less user is treated as absent.
 */

export class AccountCreationForbiddenError extends Error {
  constructor() {
    super("Création de compte refusée : seul TOPAZE ajoute des comptes.");
    this.name = "AccountCreationForbiddenError";
  }
}

interface UserRow {
  id: string;
  email: string;
  name: string;
}

function toAdapterUser(user: UserRow): AdapterUser {
  return { id: user.id, email: user.email, name: user.name, emailVerified: null, image: null };
}

const userSelect = { id: true, email: true, name: true } as const;

export function createAdapter(db: DbOrTx): Adapter {
  return {
    createUser(): never {
      throw new AccountCreationForbiddenError();
    },

    async getUser(id) {
      const user = await db.user.findUnique({ where: { id }, select: userSelect });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByEmail(email) {
      const normalized = normalizeEmail(email);
      if (!normalized) return null;
      const user = await db.user.findUnique({ where: { email: normalized }, select: userSelect });
      return user ? toAdapterUser(user) : null;
    },

    async getUserByAccount({ provider, providerAccountId }) {
      const account = await db.account.findUnique({
        where: { provider_providerAccountId: { provider, providerAccountId } },
        select: { user: { select: userSelect } },
      });
      return account ? toAdapterUser(account.user) : null;
    },

    /** Only the display name may change through Auth.js; e-mail and rights never do. */
    async updateUser({ id, name }) {
      const user = await db.user.update({
        where: { id },
        data: typeof name === "string" && name.trim() !== "" ? { name: name.trim() } : {},
        select: userSelect,
      });
      return toAdapterUser(user);
    },

    async linkAccount(account: AdapterAccount) {
      await db.account.upsert({
        where: {
          provider_providerAccountId: {
            provider: account.provider,
            providerAccountId: account.providerAccountId,
          },
        },
        create: {
          userId: account.userId,
          type: account.type,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
        },
        update: {},
      });
      return undefined;
    },

    async createSession(session) {
      const created = await db.session.create({
        data: {
          sessionToken: session.sessionToken,
          userId: session.userId,
          expires: session.expires,
        },
        select: { sessionToken: true, userId: true, expires: true },
      });
      return created;
    },

    async getSessionAndUser(sessionToken) {
      const found = await db.session.findUnique({
        where: { sessionToken },
        select: {
          sessionToken: true,
          userId: true,
          expires: true,
          user: { select: { ...userSelect, active: true, _count: { select: { profiles: true } } } },
        },
      });
      if (!found) return null;
      if (!found.user.active || found.user._count.profiles === 0) return null;
      const session: AdapterSession = {
        sessionToken: found.sessionToken,
        userId: found.userId,
        expires: found.expires,
      };
      return { session, user: toAdapterUser(found.user) };
    },

    async updateSession({ sessionToken, expires }) {
      if (!expires) return null;
      const updated = await db.session.updateMany({ where: { sessionToken }, data: { expires } });
      if (updated.count === 0) return null;
      return db.session.findUnique({
        where: { sessionToken },
        select: { sessionToken: true, userId: true, expires: true },
      });
    },

    /** Returns the deleted session: Auth.js passes it to `events.signOut` (LOGOUT audit). */
    async deleteSession(sessionToken) {
      const session = await db.session.findUnique({
        where: { sessionToken },
        select: { sessionToken: true, userId: true, expires: true },
      });
      await db.session.deleteMany({ where: { sessionToken } });
      return session;
    },
  };
}
