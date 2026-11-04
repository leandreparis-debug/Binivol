/**
 * Runs once when the Next.js server starts (not during the static build).
 * Validates the environment and reports a missing database clearly, so the
 * problem shows at startup rather than on the first request.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getEnv } = await import("@/lib/env");
  const { MISSING_DATABASE_URL_MESSAGE } = await import("@/server/db");
  const env = getEnv();
  if (!env.DATABASE_URL) {
    console.error(`[binivol] ${MISSING_DATABASE_URL_MESSAGE}`);
  }
}
