import { z } from "zod";

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

/**
 * Returns the validated environment. Parsed once, then cached for the process.
 */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
