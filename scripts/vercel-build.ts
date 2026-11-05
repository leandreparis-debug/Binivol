/**
 * `pnpm vercel-build`: the build command of Vercel. Runs the steps chosen by
 * `planVercelBuild` (src/server/deploy/buildPlan.ts) and stops at the first
 * failure. Previews never migrate nor seed.
 */
import { spawnSync } from "node:child_process";
import { BUILD_COMMANDS, planVercelBuild } from "../src/server/deploy/buildPlan";

const steps = planVercelBuild(process.env);
process.stdout.write(
  `[binivol] Build Vercel (VERCEL_ENV=${process.env.VERCEL_ENV ?? "absent"}) : ${steps.join(", ")}\n`,
);
for (const step of steps) {
  const [command, ...args] = BUILD_COMMANDS[step];
  if (!command) continue;
  process.stdout.write(`[binivol] Étape « ${step} » : ${[command, ...args].join(" ")}\n`);
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.stderr.write(`[binivol] Échec de l'étape « ${step} ».\n`);
    process.exit(result.status ?? 1);
  }
}
