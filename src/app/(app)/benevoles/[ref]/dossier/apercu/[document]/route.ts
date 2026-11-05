import { getActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { previewDocument, signatureStatus } from "@/server/dossier/signing";
import { DomainError } from "@/server/errors";
import { TEMPLATES, type TemplateKey } from "@/server/pdf/templates";
import { can } from "@/server/policy/can";
import { lookupPerson } from "@/server/services/personProfile";

/**
 * Preview of a document of the person's sent dossier (`dossier.manage`):
 * generated on the fly, marked « Aperçu », never stored. Used on site and
 * before the countersignature.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string; document: string }> },
): Promise<Response> {
  const { ref, document } = await params;
  if (!(document in TEMPLATES)) return new Response("Document inconnu.", { status: 404 });
  const actor = await getActor();
  if (!actor) return new Response("Session expirée.", { status: 401 });
  const lookup = await lookupPerson(getDb(), actor, ref);
  if (lookup.status === "notFound") return new Response("Introuvable.", { status: 404 });
  if (
    lookup.status === "forbidden" ||
    !can(actor, "dossier.manage", { person: lookup.facts }).allowed
  ) {
    return new Response("Accès refusé.", { status: 403 });
  }
  const status = await signatureStatus(getDb(), lookup.personId);
  if (!status) return new Response("Aucun dossier envoyé.", { status: 404 });
  try {
    const preview = await previewDocument(getDb(), status.submissionId, document as TemplateKey);
    return new Response(Buffer.from(preview.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": preview.disposition,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return new Response(error.message, { status: 503 });
    throw error;
  }
}
