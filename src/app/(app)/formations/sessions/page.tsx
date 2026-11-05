import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDate } from "@/lib/dates";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { listSessions, referenceOptions, type SessionRow } from "@/server/services/trainings";
import { CancelDialog, NewSessionDialog } from "../TrainingForms";

export const metadata: Metadata = { title: "Sessions de formation" };
export const dynamic = "force-dynamic";

function SessionList({
  title,
  rows,
  cancellable,
}: {
  title: string;
  rows: SessionRow[];
  cancellable: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body text-muted">Aucune session.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line" data-testid="sessions">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <Link
                    href={`/formations/sessions/${s.id}`}
                    className="rounded-inner text-body font-medium text-ink underline-offset-4 focus-ring hover:underline"
                  >
                    {s.code} — {s.label}
                  </Link>
                  <span className="text-small text-ink-2">
                    {formatDate(s.startDate)}
                    {s.endDate && ` au ${formatDate(s.endDate)}`}
                    {s.place && ` · ${s.place}`} · {s.registered} inscrit
                    {s.registered > 1 ? "s" : ""}
                    {s.capacity !== null && ` / ${String(s.capacity)} places`}
                  </span>
                  {s.cancelledAt && (
                    <span className="text-small text-danger-ink">
                      Annulée{s.cancelReason ? ` : ${s.cancelReason}` : ""}
                    </span>
                  )}
                </span>
                {cancellable && !s.cancelledAt && (
                  <CancelDialog
                    id={s.id}
                    what="session"
                    label={`${s.code} du ${formatDate(s.startDate)}`}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export default async function SessionsPage() {
  const actor = await requirePageAccess("trainingSession.manage");
  const db = getDb();
  const [upcoming, past, trainings] = await Promise.all([
    listSessions(db, actor, "upcoming"),
    listSessions(db, actor, "past"),
    referenceOptions(db, { kind: "TRAINING" }),
  ]);
  return (
    <>
      <NewSessionDialog
        trainings={trainings.map((t) => ({ id: t.id, code: t.code, label: t.label }))}
      />
      <SessionList title="Sessions à venir" rows={upcoming} cancellable />
      <SessionList title="Sessions passées" rows={past} cancellable={false} />
    </>
  );
}
