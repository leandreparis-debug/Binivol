import { parseEnv } from "@/lib/env";
import { MISSING_DATABASE_URL_MESSAGE } from "./messages";

export interface StartupCheck {
  /** Reason to refuse to start, or null. */
  fatal: string | null;
  warnings: string[];
}

/** Startup checks, pure so they can be tested (`instrumentation.ts` applies them). */
export function checkStartupEnv(raw: Record<string, string | undefined>): StartupCheck {
  let env;
  try {
    env = parseEnv(raw);
  } catch (error) {
    return { fatal: error instanceof Error ? error.message : String(error), warnings: [] };
  }
  const warnings: string[] = [];
  if (!env.DATABASE_URL) warnings.push(MISSING_DATABASE_URL_MESSAGE);
  if (raw.NODE_ENV === "production" && !env.AUTH_SECRET) {
    warnings.push("AUTH_SECRET est absente : la connexion est impossible.");
  }
  if (env.AUTH_DEMO_LOGIN)
    warnings.push("Connexion de démonstration ACTIVE (comptes @binivol.test).");
  return { fatal: null, warnings };
}
