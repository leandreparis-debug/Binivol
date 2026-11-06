import { contentDisposition } from "@/lib/fileNames";
import { getActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { ForbiddenError } from "@/server/policy/can";
import { gdprExportByRef } from "@/server/services/gdprExport";
import { getStorage } from "@/server/storage";
import type { StorageService } from "@/server/storage/types";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * Export of all the data of a person (step 14, TOPAZE, docs/rgpd.md): a ZIP
 * (JSON, PDF summary, documents). Journaled by the service.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ref: string }> },
): Promise<Response> {
  const actor = await getActor();
  if (!actor) return text(401, "Connexion requise.");
  const { ref } = await params;
  if (!/^P-\d{5,}$/.test(ref)) return text(404, "Personne introuvable.");
  let storage: StorageService | null = null;
  try {
    storage = getStorage();
  } catch {
    storage = null;
  }
  try {
    const result = await gdprExportByRef(getDb(), storage, actor, ref);
    return new Response(new Uint8Array(result.zip), {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/zip",
        "Content-Length": String(result.zip.length),
        "Content-Disposition": contentDisposition(result.fileName),
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return text(403, "Export réservé à TOPAZE.");
    if (error instanceof DomainError) return text(404, error.message);
    throw error;
  }
}
