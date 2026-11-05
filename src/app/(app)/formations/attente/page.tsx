import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListChecks } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { TRAINING_WISH_STATUS_LABELS } from "@/lib/labels";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listSessions, waitingLists } from "@/server/services/trainings";
import { ScheduleWish } from "../TrainingForms";

export const metadata: Metadata = { title: "Listes d'attente" };
export const dynamic = "force-dynamic";

/** Wishes by training, priority then seniority; « Inscrire » turns one into a registration. */
export default async function WaitingPage() {
  const actor = await requirePageAccess("trainingSession.manage");
  const db = getDb();
  const [lists, upcoming] = await Promise.all([
    waitingLists(db, actor),
    listSessions(db, actor, "upcoming"),
  ]);
  if (lists.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title="Aucun souhait en attente"
        description="Les souhaits se saisissent dans l'onglet Formations de la fiche."
      />
    );
  }
  return (
    <>
      {lists.map((list) => {
        const sessions = upcoming
          .filter((s) => s.code === list.code && !s.cancelledAt)
          .map((s) => ({
            id: s.id,
            label: `${formatDate(s.startDate)}${s.place ? ` · ${s.place}` : ""}`,
          }));
        return (
          <Card key={list.referenceId}>
            <CardHeader>
              <CardTitle as="h2">
                {list.code} — {list.label} ({list.wishes.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col divide-y divide-line">
                {list.wishes.map((w) => (
                  <li key={w.id} className="flex flex-wrap items-end justify-between gap-3 py-3">
                    <span className="flex flex-col">
                      <Link
                        href={`/benevoles/${w.ref}?onglet=formations`}
                        className="text-body text-ink underline-offset-4 hover:underline"
                      >
                        {w.firstName} {w.lastName}
                      </Link>
                      <span className="text-small text-ink-2">
                        {TRAINING_WISH_STATUS_LABELS[w.status]} · depuis le{" "}
                        {formatDate(w.createdAt)}
                        {w.priority > 0 && ` · priorité ${String(w.priority)}`}
                        {w.comment && ` · ${w.comment}`}
                      </span>
                    </span>
                    {w.status !== "SCHEDULED" && (
                      <ScheduleWish
                        wishId={w.id}
                        name={`${w.firstName} ${w.lastName}`}
                        sessions={sessions}
                      />
                    )}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        );
      })}
    </>
  );
}
