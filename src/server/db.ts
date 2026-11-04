import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type Prisma } from "@/generated/prisma/client";
import { getEnv } from "@/lib/env";

/** A full client (can open transactions). */
export type Db = PrismaClient;
/** A client bound to an interactive transaction. */
export type Tx = Prisma.TransactionClient;
/** Anything that can run queries: repositories accept both. */
export type DbOrTx = Db | Tx;

/** Raised when the database is used without a valid configuration. */
export class DatabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseConfigError";
  }
}

export const MISSING_DATABASE_URL_MESSAGE =
  "DATABASE_URL est absente : l'application ne peut pas joindre PostgreSQL. " +
  "Renseigne-la dans .env (voir .env.example et la section « Base de données » du README).";

export interface CreateDbOptions {
  /** Logs every SQL query (development only). */
  logQueries?: boolean;
}

/**
 * Creates a Prisma client on standard PostgreSQL through the `pg` driver
 * adapter. No provider-specific SDK is involved, so the same code runs on
 * Docker, Supabase (used as plain Postgres) and a VPS.
 */
export function createDb(connectionString: string, options: CreateDbOptions = {}): Db {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: options.logQueries ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

const globalForDb = globalThis as unknown as { binivolDb?: Db };

/**
 * Returns the shared Prisma client, created on first use from `DATABASE_URL`.
 *
 * The instance is kept on `globalThis` so Next's hot reload does not open a
 * new pool on every change. Queries are logged in development only.
 *
 * @throws {DatabaseConfigError} when `DATABASE_URL` is missing. The check is
 * lazy on purpose: static pages build without a database.
 */
export function getDb(): Db {
  if (globalForDb.binivolDb) return globalForDb.binivolDb;
  const url = getEnv().DATABASE_URL;
  if (!url) throw new DatabaseConfigError(MISSING_DATABASE_URL_MESSAGE);
  const db = createDb(url, { logQueries: process.env.NODE_ENV === "development" });
  globalForDb.binivolDb = db;
  return db;
}

/** True when the argument can open a transaction (a full client, not a `Tx`). */
export function isFullClient(db: DbOrTx): db is Db {
  return "$transaction" in db && typeof db.$transaction === "function";
}

/**
 * Runs `fn` inside a transaction: opens one on a full client, reuses the
 * current one when `db` is already a transaction client.
 */
export async function inTransaction<T>(db: DbOrTx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (isFullClient(db)) return db.$transaction(fn);
  return fn(db);
}
