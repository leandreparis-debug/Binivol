/**
 * What the Vercel build runs, decided from the environment only (pure).
 *
 * - `migrate` (`prisma migrate deploy`): **production only** (`VERCEL_ENV=production`);
 * - `seed` (demo seed, ADR-035): production **and** `AUTH_DEMO_LOGIN=true` **and**
 *   `AUTH_DEMO_ON_VERCEL=true`;
 * - `build` (`next build`): always.
 *
 * A branch preview therefore never touches the schema nor the data. A preview
 * whose code needs a migration not yet applied in production may fail until
 * that migration reaches production: this is intended (ADR-036, docs/deploy.md).
 */
export type BuildStep = "migrate" | "seed" | "build";

export function planVercelBuild(env: Record<string, string | undefined>): BuildStep[] {
  const production = env.VERCEL_ENV === "production";
  const demo = env.AUTH_DEMO_LOGIN === "true" && env.AUTH_DEMO_ON_VERCEL === "true";
  return [
    ...(production ? (["migrate"] as const) : []),
    ...(production && demo ? (["seed"] as const) : []),
    "build",
  ];
}

/** Command of each step (run from the project root). */
export const BUILD_COMMANDS: Record<BuildStep, string[]> = {
  migrate: ["pnpm", "exec", "prisma", "migrate", "deploy"],
  seed: ["pnpm", "exec", "tsx", "scripts/hosted-demo-seed.ts"],
  build: ["pnpm", "exec", "next", "build"],
};
