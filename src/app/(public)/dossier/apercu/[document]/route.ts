import { getDb } from "@/server/db";
import { candidateSession } from "@/server/dossier/current";
import { previewDocument } from "@/server/dossier/signing";
import { DomainError } from "@/server/errors";
import { TEMPLATES, type TemplateKey } from "@/server/pdf/templates";

/**
 * Preview of a document before signature (dossier cookie, dossier sent and
 * not signed yet): generated on the fly, marked « Aperçu », never stored.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ document: string }> },
): Promise<Response> {
  const { document } = await params;
  if (!(document in TEMPLATES)) return new Response("Document inconnu.", { status: 404 });
  const session = await candidateSession(getDb());
  if (session.state !== "signing") {
    return new Response("Ce lien n'est plus valable. Contactez l'unité locale.", { status: 403 });
  }
  try {
    const preview = await previewDocument(
      getDb(),
      session.context.submissionId,
      document as TemplateKey,
    );
    return new Response(Buffer.from(preview.bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": preview.disposition,
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    if (error instanceof DomainError) return new Response(error.message, { status: 503 });
    throw error;
  }
}
