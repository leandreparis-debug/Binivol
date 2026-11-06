import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/server/auth/cookies";

/**
 * Fast redirect to /connexion when no session cookie is present. This is
 * **not** the security: the cookie is not verified here (no database on the
 * edge). Every layout, page and action checks the session server side.
 */
export function middleware(request: NextRequest) {
  const hasSession = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (hasSession) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/connexion";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except: sign-in page, Auth.js routes, health probe, the future
  // candidate link (/dossier/*), Next internals and static files.
  matcher: [
    "/((?!connexion|confidentialite|api/auth|api/health|api/taches|dossier|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
