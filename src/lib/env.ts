import { z } from "zod";

const postgresUrl = z
  .string()
  .trim()
  .regex(/^postgres(ql)?:\/\/\S+$/, "doit être une URL PostgreSQL (postgresql://…)");

/**
 * Schema of the environment variables the application reads.
 *
 * Every variable is optional at this step. A variable that is present but
 * invalid raises an explicit error naming the variable (never its value).
 */
export const envSchema = z.object({
  /** Display name of the application. Defaults to « Binivol ». */
  NEXT_PUBLIC_APP_NAME: z.string().trim().min(1).default("Binivol"),
  /** Public URL of the application, without trailing slash. */
  APP_URL: z.url().optional(),
  /**
   * Connection used by the application at runtime. May go through a pooler
   * (Supabase: port 6543 with `pgbouncer=true`). Optional so that pages that
   * do not touch the database still build; `src/server/db.ts` raises a clear
   * error on first use when it is missing.
   */
  DATABASE_URL: postgresUrl.optional(),
  /** Direct connection used by migrations (Supabase: port 5432). */
  DIRECT_URL: postgresUrl.optional(),
  /** Enables the `/design` page in production. Always enabled in development. */
  ENABLE_DESIGN_PAGE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses a raw environment map. Empty strings are treated as absent so that a
 * commented-out or blank line in `.env` never trips validation.
 *
 * @throws {Error} when a present variable is invalid. The message lists the
 * variable names and the reason, but never echoes the received value.
 */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim() !== "") {
      cleaned[key] = value;
    }
  }
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "(racine)"} : ${issue.message}`)
      .join(" ; ");
    throw new Error(`Variables d'environnement invalides — ${details}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Clears the cached environment (tests only). */
export function resetEnvCache(): void {
  cached = undefined;
}

/**
 * Returns the validated environment. Parsed once, then cached for the process.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
