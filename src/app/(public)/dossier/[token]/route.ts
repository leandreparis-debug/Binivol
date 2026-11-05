import { NextResponse, type NextRequest } from "next/server";
import { shouldUseSecureCookies } from "@/server/auth/cookies";
import { getDb } from "@/server/db";
import { DOSSIER_COOKIE, dossierCookieOptions, sealDossierSession } from "@/server/dossier/session";
import { openDossierLink } from "@/server/services/dossiers";

/**
 * Opening of a dossier link. The token is checked (only its SHA-256 is
 * stored), exchanged for the dossier cookie, then the browser goes to
 * `/dossier`: the token leaves the address bar and the history. A refused
 * link (unknown, expired, revoked, used) gets the same neutral page.
 *
 * The redirect is relative: the browser stays on the host it asked (behind a
 * proxy, the request URL seen by the server may name another one).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  const outcome = await openDossierLink(getDb(), token);
  const response = new NextResponse(null, {
    status: 303,
    headers: {
      Location: outcome.ok ? "/dossier" : "/dossier/lien-invalide",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
  const options = dossierCookieOptions(shouldUseSecureCookies());
  if (outcome.ok) response.cookies.set(DOSSIER_COOKIE, sealDossierSession(outcome.linkId), options);
  else response.cookies.set(DOSSIER_COOKIE, "", { ...options, maxAge: 0 });
  return response;
}
