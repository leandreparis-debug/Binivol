import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

/**
 * Two projects:
 * - `unit` (pnpm test): fast, no database, jsdom;
 * - `db` (pnpm test:db): `*.db.test.ts` against a real PostgreSQL test
 *   database (TEST_DATABASE_URL), migrated once, reset before each file.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/test/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["node_modules", ".next", "e2e", "**/*.db.test.ts"],
          css: false,
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          environment: "node",
          globals: true,
          include: ["src/**/*.db.test.ts", "prisma/**/*.db.test.ts"],
          globalSetup: ["./src/test/db/globalSetup.ts"],
          setupFiles: ["./src/test/db/setup.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
