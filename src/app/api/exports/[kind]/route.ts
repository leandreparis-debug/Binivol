import { contentDisposition } from "@/lib/fileNames";
import { getActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { ForbiddenError } from "@/server/policy/can";
import { parseDirectoryQuery } from "@/server/services/directory";
import { directoryExport, matrixExport, prefectureExport } from "@/server/services/exports";
import { logExport, parseLogFilters } from "@/server/services/logs";
import { MATRIX_CATEGORIES } from "@/server/services/matrix";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function text(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * CSV exports (step 13, docs/exports.md): `prefecture`, `annuaire` (the
 * directory filters of the query string), `matrice` (`?categorie=`). The
 * policy is checked and the export written to the access log by the service.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ kind: string }> },
): Promise<Response> {
  const actor = await getActor();
  if (!actor) return text(401, "Connexion requise.");
  const { kind } = await params;
  const url = new URL(request.url);
  const db = getDb();
  try {
    let result;
    if (kind === "prefecture") result = await prefectureExport(db, actor);
    else if (kind === "annuaire") {
      const raw: Record<string, string | string[]> = {};
      for (const key of new Set(url.searchParams.keys())) {
        const values = url.searchParams.getAll(key);
        raw[key] = values.length > 1 ? values : (values[0] ?? "");
      }
      result = await directoryExport(db, actor, parseDirectoryQuery(raw));
    } else if (kind === "matrice") {
      const category = url.searchParams.get("categorie");
      result = await matrixExport(db, actor, MATRIX_CATEGORIES.find((c) => c === category) ?? null);
    } else if (kind === "journal") {
      const raw: Record<string, string> = {};
      for (const [key, value] of url.searchParams) raw[key] = value;
      result = await logExport(
        db,
        actor,
        raw.journal === "acces" ? "acces" : "audit",
        parseLogFilters(raw),
      );
    } else return text(404, "Export inconnu.");
    return new Response(result.csv, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(result.fileName),
      },
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return text(403, "Vous n'avez pas accès à cet export.");
    throw error;
  }
}
