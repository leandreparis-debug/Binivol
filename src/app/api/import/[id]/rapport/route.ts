import { NextResponse } from "next/server";
import { formatDateTime } from "@/lib/dates";
import { getActor } from "@/server/auth/actor";
import { getDb } from "@/server/db";
import { getImportRun } from "@/server/import/history";
import { reportToCsv } from "@/server/import/report";
import { can } from "@/server/policy/can";

export const dynamic = "force-dynamic";

/** CSV of a stored import report (TOPAZE, `import.run`). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await getActor();
  if (!actor) return new NextResponse("Connexion requise.", { status: 401 });
  if (!can(actor, "import.run").allowed) return new NextResponse("Accès refusé.", { status: 403 });
  const { id } = await params;
  const run = await getImportRun(getDb(), id);
  if (!run?.parsedReport) return new NextResponse("Rapport introuvable.", { status: 404 });
  const csv = reportToCsv(run.parsedReport, {
    date: formatDateTime(run.startedAt),
    author: run.actorLabel,
  });
  const day = run.startedAt.toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="rapport-import-${day}-${run.id}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
