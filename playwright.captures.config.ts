import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * `pnpm captures`: regenerates the screenshots of docs/captures/ at 1440,
 * 834 and 390 px, on the fictitious seed (same server and database setup as
 * the e2e tests). Not part of `pnpm test:e2e`.
 */
export default defineConfig({
  ...base,
  testDir: "./scripts/captures",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 900_000,
  reporter: "list",
  projects: [{ name: "captures", use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 } }],
});
