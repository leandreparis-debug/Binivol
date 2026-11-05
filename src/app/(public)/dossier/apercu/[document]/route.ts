import { getDb } from "@/server/db";
import { candidateSession } from "@/server/dossier/current";
import { DomainError } from "@/server/errors";
import { DOCUMENTS, previewDocument, type DocumentKey } from "@/server/signature/service";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
};

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * The candidate's preview of a document **before signature** (step 8):
 * generated on the fly from her own sent dossier, marked « Aperçu », never
 * stored. Behind the dossier cookie, while the signatures are expected.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ document: string }> },
): Promise<Response> {
  const { document } = await params;
  if (!DOCUMENTS.some((d) => d.key === document)) return text(404, "Document inconnu.");
  const db = getDb();
  const session = await candidateSession(db);
  if (session.state !== "signing") return text(403, "Ce lien n'est plus valable.");
  try {
    const preview = await previewDocument(
      db,
      { personId: session.personId, candidate: true },
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
    if (error instanceof DomainError) return text(503, error.message);
    throw error;
  }
}
