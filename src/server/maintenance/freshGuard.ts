/**
 * Guard of `pnpm db:fresh`, which DROPS and recreates a database. Pure, so it
 * can be tested. Only a local database may be wiped: localhost, 127.0.0.1,
 * ::1, or the Docker Compose services `db` / `db-test`; never with
 * NODE_ENV=production.
 */

export const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "db", "db-test"] as const;

export type FreshTarget =
  { ok: true; host: string; database: string } | { ok: false; reason: string };

export function checkFreshTarget(
  databaseUrl: string | undefined,
  nodeEnv: string | undefined,
): FreshTarget {
  if (nodeEnv === "production") {
    return { ok: false, reason: "db:fresh est interdit quand NODE_ENV=production." };
  }
  if (!databaseUrl) return { ok: false, reason: "DATABASE_URL est absente." };
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return { ok: false, reason: "DATABASE_URL n'est pas une URL valide." };
  }
  if (!/^postgres(ql)?:$/.test(url.protocol)) {
    return { ok: false, reason: "DATABASE_URL doit être une URL PostgreSQL." };
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!(LOCAL_HOSTS as readonly string[]).includes(host)) {
    return {
      ok: false,
      reason: `db:fresh refuse l'hôte « ${host} » : seules les bases locales (${LOCAL_HOSTS.join(", ")}) peuvent être recréées.`,
    };
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/^[A-Za-z0-9_-]+$/.test(database)) {
    return { ok: false, reason: "Nom de base absent ou invalide dans DATABASE_URL." };
  }
  return { ok: true, host, database };
}
