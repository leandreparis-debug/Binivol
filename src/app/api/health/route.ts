import { NextResponse } from "next/server";
import packageJson from "../../../../package.json";

export const dynamic = "force-dynamic";

/**
 * Liveness probe used by Docker's HEALTHCHECK and by the e2e web server.
 * Returns only the status and the application version, nothing sensitive.
 */
export function GET() {
  return NextResponse.json(
    { status: "ok", version: packageJson.version },
    { headers: { "Cache-Control": "no-store" } },
  );
}
