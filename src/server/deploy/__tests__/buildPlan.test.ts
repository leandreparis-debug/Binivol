// @vitest-environment node
import { describe, expect, it } from "vitest";
import { BUILD_COMMANDS, planVercelBuild } from "../buildPlan";

describe("planVercelBuild", () => {
  it.each([
    [{ VERCEL_ENV: "production" }, ["migrate", "build"]],
    [
      { VERCEL_ENV: "production", AUTH_DEMO_LOGIN: "true", AUTH_DEMO_ON_VERCEL: "true" },
      ["migrate", "seed", "build"],
    ],
    [{ VERCEL_ENV: "production", AUTH_DEMO_LOGIN: "true" }, ["migrate", "build"]],
    [{ VERCEL_ENV: "production", AUTH_DEMO_ON_VERCEL: "true" }, ["migrate", "build"]],
    [{ VERCEL_ENV: "preview" }, ["build"]],
    [{ VERCEL_ENV: "preview", AUTH_DEMO_LOGIN: "true", AUTH_DEMO_ON_VERCEL: "true" }, ["build"]],
    [
      { VERCEL_ENV: "development", AUTH_DEMO_LOGIN: "true", AUTH_DEMO_ON_VERCEL: "true" },
      ["build"],
    ],
    [{}, ["build"]],
  ])("%j → %j", (env, steps) => {
    expect(planVercelBuild(env)).toEqual(steps);
  });

  it("never migrates nor seeds a preview, whatever the other variables", () => {
    for (const demo of ["true", "false", undefined]) {
      for (const onVercel of ["true", "false", undefined]) {
        const steps = planVercelBuild({
          VERCEL_ENV: "preview",
          AUTH_DEMO_LOGIN: demo,
          AUTH_DEMO_ON_VERCEL: onVercel,
        });
        expect(steps).toEqual(["build"]);
      }
    }
  });

  it("runs prisma migrate deploy, the hosted demo seed and next build", () => {
    expect(BUILD_COMMANDS.migrate.join(" ")).toBe("pnpm exec prisma migrate deploy");
    expect(BUILD_COMMANDS.seed.join(" ")).toContain("scripts/hosted-demo-seed.ts");
    expect(BUILD_COMMANDS.build.join(" ")).toBe("pnpm exec next build");
  });
});
