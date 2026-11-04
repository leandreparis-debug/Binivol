import "dotenv/config";
import { createDb, type Db } from "@/server/db";

/** Matches the `db-test` service of docker-compose.yml. */
export const DEFAULT_TEST_DATABASE_URL = "postgresql://binivol:binivol@localhost:5433/binivol_test";

/**
 * URL of the integration-test database. Refuses any database whose name does
 * not contain « test », and the URL of the application database, so the
 * reset can never hit real data.
 */
export function resolveTestDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL ?? DEFAULT_TEST_DATABASE_URL;
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!/test/i.test(name)) {
    throw new Error(
      `TEST_DATABASE_URL doit viser une base de test (nom contenant « test »), reçu « ${name} ».`,
    );
  }
  if (process.env.DATABASE_URL && process.env.DATABASE_URL === url) {
    throw new Error("TEST_DATABASE_URL ne doit pas être la base de l'application (DATABASE_URL).");
  }
  return url;
}

let shared: Db | undefined;

/** Prisma client on the test database (one per test file). */
export function getTestDb(): Db {
  shared ??= createDb(resolveTestDatabaseUrl());
  return shared;
}

export async function disconnectTestDb(): Promise<void> {
  await shared?.$disconnect();
  shared = undefined;
}

/**
 * Empties every table and restarts the readable-number sequences. The logs
 * are append-only, so the reset enables `binivol.allow_purge` for its own
 * transaction only (the same mechanism the GDPR purge will use).
 */
export async function resetDatabase(db: Db): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET LOCAL binivol.allow_purge = 'on'");
    if (list) await tx.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    for (const seq of ["person_ref_seq", "training_record_ref_seq", "appointment_ref_seq"]) {
      await tx.$executeRawUnsafe(`ALTER SEQUENCE ${seq} RESTART WITH 1`);
    }
  });
}
