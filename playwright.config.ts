import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3000);
const baseURL = `http://127.0.0.1:${PORT}`;

/** Database of the e2e run: E2E_DATABASE_URL when set (recommended locally), else DATABASE_URL. */
export const E2E_DATABASE_URL = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;

/**
 * End-to-end tests run against the production build (`pnpm build && pnpm start`)
 * with the demo sign-in enabled, on a database migrated and seeded by
 * `e2e/global-setup.ts`.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "on-first-retry",
    // No colour transitions while axe measures contrast (prefers-reduced-motion is honoured).
    contextOptions: { reducedMotion: "reduce" },
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop",
      testIgnore: /(import|candidates|dossier)\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      // The import adds 24 people and the candidate tests create candidates: they run
      // after every other test, so the directory counts checked there stay those of the seed.
      name: "chromium-desktop-late",
      testMatch: /(import|candidates|dossier)\.spec\.ts/,
      dependencies: ["chromium-desktop", "chromium-mobile"],
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile-late",
      testMatch: /(candidates|dossier)\.spec\.ts/,
      dependencies: ["chromium-desktop", "chromium-mobile"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
    {
      name: "chromium-mobile",
      testIgnore: /(import|candidates|dossier)\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 3,
      },
    },
  ],
  webServer: {
    command: "pnpm build && pnpm start",
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      PORT: String(PORT),
      ENABLE_DESIGN_PAGE: "true",
      AUTH_DEMO_LOGIN: "true",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_DIR: "./storage/e2e",
      AUTH_URL: baseURL,
      // Test-only secret (the e2e database holds synthetic data only).
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-production-000000",
      ...(E2E_DATABASE_URL ? { DATABASE_URL: E2E_DATABASE_URL } : {}),
    },
  },
});
