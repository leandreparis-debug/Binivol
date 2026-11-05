import { z } from "zod";

const booleanFlag = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

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
export const envObject = z.object({
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
  ENABLE_DESIGN_PAGE: booleanFlag,

  // --- Authentication (Auth.js) -------------------------------------------
  /** Secret that signs Auth.js cookies and tokens (`openssl rand -base64 32`). */
  AUTH_SECRET: z.string().min(32, "doit compter au moins 32 caractères").optional(),
  /** Key of the HMAC of the signature codes (step 8). Optional: derived from AUTH_SECRET. */
  OTP_SECRET: z.string().min(32, "doit compter au moins 32 caractères").optional(),
  /** Public URL of the app for Auth.js callbacks; deduced from the request when absent. */
  AUTH_URL: z.url().optional(),
  /** Google OAuth client (Google Cloud console). Google sign-in is off when absent. */
  AUTH_GOOGLE_ID: z.string().trim().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().trim().min(1).optional(),
  /** Only addresses of this domain may sign in with Google. */
  AUTH_ALLOWED_DOMAIN: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "doit être un nom de domaine (ex. croix-rouge.fr)")
    .default("croix-rouge.fr"),
  /** Demo sign-in with the `@binivol.test` seed accounts. Never on Vercel, unless the next flag. */
  AUTH_DEMO_LOGIN: booleanFlag,
  /**
   * Exception (ADR-035): allows the demo sign-in on a Vercel **test** deployment
   * holding fictitious data only. The legacy import is then refused.
   */
  AUTH_DEMO_ON_VERCEL: booleanFlag,
  /** Set by Vercel on every deployment (production, preview, development). */
  VERCEL_ENV: z.string().optional(),

  // --- E-mail (MailService, docs/mail.md) ------------------------------------
  /** `log` (written to outbound_mails, encrypted: development, tests, demo) or `smtp`. */
  MAIL_DRIVER: z.enum(["log", "smtp"]).default("log"),
  SMTP_HOST: z.string().trim().min(1).optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().trim().min(1).optional(),
  SMTP_PASSWORD: z.string().min(1).optional(),
  /** Sender, e.g. « Binivol <no-reply@exemple.org> ». */
  SMTP_FROM: z.string().trim().min(3).optional(),

  // --- Scheduled tasks (docs/taches.md) -------------------------------------
  /**
   * Shared secret of the daily task route (`Authorization: Bearer …`). Unset:
   * the route refuses every call. Typed in Vercel (or on the VPS), never in a file.
   */
  CRON_SECRET: z.string().min(32).optional(),

  // --- Document storage (StorageService, docs/storage.md) -------------------
  /** `local` (a folder on disk: development, VPS) or `s3` (S3-compatible: Supabase Storage, MinIO…). */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  /** Folder of the `local` driver. Relative paths start from the working directory. */
  STORAGE_LOCAL_DIR: z.string().trim().min(1).default("./storage"),
  /** S3 endpoint (Supabase: the one shown in Storage settings, https://<project>.supabase.co/storage/v1/s3). */
  S3_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().trim().min(1).optional(),
  /** Private bucket: never public, files are only served through the application. */
  S3_BUCKET: z.string().trim().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().trim().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().trim().min(1).optional(),
  /** Path-style URLs (`endpoint/bucket/key`): true for Supabase and MinIO. */
  S3_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
});

/**
 * Full schema. Refuses the demo sign-in on Vercel: if both are set, parsing
 * fails, so the server (and the Vercel build) refuses to start — unless the
 * explicit test exception `AUTH_DEMO_ON_VERCEL=true` is set (ADR-035).
 */
export const envSchema = envObject.superRefine((env, ctx) => {
  if (env.AUTH_DEMO_LOGIN && env.VERCEL_ENV !== undefined && !env.AUTH_DEMO_ON_VERCEL) {
    ctx.addIssue({
      code: "custom",
      path: ["AUTH_DEMO_LOGIN"],
      message:
        "la connexion de démonstration est interdite sur Vercel (VERCEL_ENV est défini) : retire AUTH_DEMO_LOGIN (exception de test : AUTH_DEMO_ON_VERCEL=true, ADR-035)",
    });
  }
  if (env.MAIL_DRIVER === "smtp") {
    for (const key of ["SMTP_HOST", "SMTP_FROM"] as const) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "obligatoire quand MAIL_DRIVER=smtp",
        });
      }
    }
  }
  if (env.STORAGE_DRIVER === "s3") {
    for (const key of [
      "S3_ENDPOINT",
      "S3_REGION",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
    ] as const) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "obligatoire quand STORAGE_DRIVER=s3",
        });
      }
    }
  }
  if ((env.AUTH_GOOGLE_ID === undefined) !== (env.AUTH_GOOGLE_SECRET === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: ["AUTH_GOOGLE_SECRET"],
      message: "AUTH_GOOGLE_ID et AUTH_GOOGLE_SECRET vont ensemble",
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/** True when the demo sign-in is enabled (and therefore allowed: see `envSchema`). */
export function isDemoLoginEnabled(env: Env = getEnv()): boolean {
  return env.AUTH_DEMO_LOGIN && (env.VERCEL_ENV === undefined || env.AUTH_DEMO_ON_VERCEL);
}

/**
 * True on a hosted demo (demo sign-in allowed on Vercel by ADR-035): the
 * database holds fictitious data only, so importing a workbook is refused.
 */
export function isHostedDemo(env: Env = getEnv()): boolean {
  return env.AUTH_DEMO_LOGIN && env.VERCEL_ENV !== undefined && env.AUTH_DEMO_ON_VERCEL;
}

/** True when the Google provider is configured. */
export function isGoogleConfigured(env: Env = getEnv()): boolean {
  return env.AUTH_GOOGLE_ID !== undefined && env.AUTH_GOOGLE_SECRET !== undefined;
}

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
