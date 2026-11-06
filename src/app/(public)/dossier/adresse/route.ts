import { NextResponse } from "next/server";
import { getDb } from "@/server/db";
import { candidateSession } from "@/server/dossier/current";
import { addressQuerySchema, suggestForDossier } from "@/server/geo/suggest";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * `POST /dossier/adresse` (step 16, ADR-068): address suggestions for the
 * candidate filling her dossier. Under `/dossier` because the dossier cookie
 * is scoped to that path. The text travels in the body (never in an address
 * that hosting logs would keep); it is validated (3 to 120 characters), never
 * logged nor cached. No valid dossier cookie: 401.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const db = getDb();
  const session = await candidateSession(db);
  if (session.state !== "active") {
    return NextResponse.json({ error: "Session expirée." }, { status: 401, headers: NO_STORE });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const parsed = addressQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ suggestions: [] }, { status: 400, headers: NO_STORE });
  }
  const suggestions = await suggestForDossier(db, session.context.linkId, parsed.data);
  return NextResponse.json({ suggestions }, { headers: NO_STORE });
}
