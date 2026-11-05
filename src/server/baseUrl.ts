import { headers } from "next/headers";
import { getEnv } from "@/lib/env";

/**
 * Public origin of the application, for links sent outside (dossier links):
 * `APP_URL`, else `AUTH_URL`, else the origin of the current request.
 */
export async function appBaseUrl(): Promise<string> {
  const env = getEnv();
  const configured = env.APP_URL ?? env.AUTH_URL;
  if (configured) return new URL(configured).origin;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
