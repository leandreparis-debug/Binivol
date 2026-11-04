import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma CLI configuration (migrations, seed, studio).
 *
 * Migrations go through `DIRECT_URL` (a direct connection: Supabase port 5432)
 * because a transaction pooler cannot run DDL safely. The application itself
 * connects through `DATABASE_URL` (see `src/server/db.ts`).
 * `prisma generate` needs no database, so a missing URL is not an error here.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
    // Optional. Needed when the database user cannot create a temporary
    // shadow database (Supabase), and for `migrate diff --from-migrations`.
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
