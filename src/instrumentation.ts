/**
 * Runs once when the Next.js server starts (not during the static build).
 *
 * - An invalid environment stops the server, with the reason. In particular
 *   AUTH_DEMO_LOGIN=true with VERCEL_ENV set: the demo sign-in must never
 *   exist on Vercel.
 * - A missing DATABASE_URL is reported clearly.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkStartupEnv } = await import("@/server/startup");
  const result = checkStartupEnv(process.env);
  for (const warning of result.warnings) console.error(`[binivol] ${warning}`);
  if (result.fatal) {
    console.error(`[binivol] Démarrage refusé : ${result.fatal}`);
    process.exit(1);
  }
}
