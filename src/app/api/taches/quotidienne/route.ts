import { NextResponse } from "next/server";
import { getEnv } from "@/lib/env";
import { checkCronAuthorization } from "@/server/cron";
import { getDb } from "@/server/db";
import { runDailyTask } from "@/server/services/automation";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * The daily task (step 12, docs/taches.md): reminders, dossier reminders,
 * digests, greetings. `POST` for a system cron, `GET` for Vercel Cron, both
 * behind `Authorization: Bearer <CRON_SECRET>`. Idempotent per Paris day.
 */
async function handle(request: Request): Promise<NextResponse> {
  const auth = checkCronAuthorization(request.headers.get("authorization"), getEnv().CRON_SECRET);
  if (auth === "no-secret") {
    console.error("[binivol] Tâche quotidienne refusée : CRON_SECRET n'est pas configuré.");
    return NextResponse.json({ error: "Tâche désactivée." }, { status: 503 });
  }
  if (auth === "denied") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  const result = await runDailyTask(getDb());
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
