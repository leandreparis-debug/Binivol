import { getActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { ForbiddenError } from "@/server/policy/can";
import { lookupPerson } from "@/server/services/personProfile";
import { DOCUMENTS, previewDocument, type DocumentKey } from "@/server/signature/service";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * A responsible's preview of a document before counter-signature
 * (`dossier.manage`): generated on the fly, never stored, the read of the
 * dossier journaled (context « aperçu des documents »). 404 when the person
 * is not visible, 403 when out of scope.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string; document: string }> },
): Promise<Response> {
  const actor = await getActor();
  if (!actor) return text(401, "Connexion requise.");
  const { ref, document } = await params;
  if (!DOCUMENTS.some((d) => d.key === document)) return text(404, "Document inconnu.");
  const db = getDb();
  const lookup = await lookupPerson(db, actor, ref);
  if (lookup.status === "notFound") return text(404, "Personne introuvable.");
  if (lookup.status === "forbidden") return text(403, "Vous n'avez pas accès à ce dossier.");
  try {
    const preview = await previewDocument(
      db,
      { personId: lookup.personId, actor, facts: lookup.facts },
      document as DocumentKey,
    );
    return new Response(new Uint8Array(preview.bytes), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/pdf",
        "Content-Disposition": preview.disposition,
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return text(403, "Vous n'avez pas accès à ce dossier.");
    if (error instanceof DomainError) return text(409, error.message);
    throw error;
  }
}
