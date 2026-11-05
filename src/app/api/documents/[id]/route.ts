import { getActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { ForbiddenError } from "@/server/policy/can";
import { openDocument } from "@/server/services/documents";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Download of a document. `document.read` is checked and the consultation is
 * journaled (`access_logs`, scope DOCUMENT_VIEW) before any byte is sent.
 * Always an attachment, never cached, never sniffed. There is no public or
 * presigned URL: the browser only ever sees this route.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await getActor();
  if (!actor) return text(401, "Connexion requise.");
  const { id } = await params;
  if (!/^[a-z0-9_]{10,40}$/i.test(id)) return text(404, "Document introuvable.");
  try {
    const { meta, body } = await openDocument(getDb(), getStorage(), actor, id, "fiche");
    return new Response(new Uint8Array(body), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": meta.mimeType,
        "Content-Length": String(body.length),
        "Content-Disposition": `attachment; filename="${meta.fileName.replace(/["\\\r\n]/g, "_")}"`,
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return text(403, "Vous n'avez pas accès à ce document.");
    if (error instanceof DomainError) {
      if (error.code === "STORAGE_UNAVAILABLE") return text(503, error.message);
      return text(404, error.code === "FILE_MISSING" ? "Fichier absent." : "Document introuvable.");
    }
    throw error;
  }
}
