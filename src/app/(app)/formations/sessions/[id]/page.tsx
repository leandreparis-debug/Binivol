import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDate } from "@/lib/dates";
import { TRAINING_RESULT_LABELS } from "@/lib/labels";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { entryCandidates, sessionDetail } from "@/server/services/trainings";
import { CancelDialog, GroupEntryForm, ResultsForm } from "../../TrainingForms";

export const metadata: Metadata = { title: "Session de formation" };
export const dynamic = "force-dynamic";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageAccess("trainingSession.manage");
  const { id } = await params;
  if (!/^[a-z0-9_]{5,40}$/i.test(id)) notFound();
  const db = getDb();
  const [session, people] = await Promise.all([
    sessionDetail(db, actor, id),
    entryCandidates(db, actor),
  ]);
  if (!session) notFound();
  const name = (l: { firstName: string; lastName: string }) => `${l.firstName} ${l.lastName}`;
  return (
    <>
      <Link
        href="/formations/sessions"
        className="inline-flex min-h-11 w-max items-center gap-2 rounded-pill text-small text-ink-2 focus-ring hover:text-ink"
      >
        <ArrowLeft aria-hidden="true" className="size-4" /> Sessions
      </Link>
      <Card>
        <CardHeader>
          <CardTitle as="h2">
            {session.code} — {session.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-body text-ink-2">
          <p>
            {formatDate(session.startDate)}
            {session.endDate && ` au ${formatDate(session.endDate)}`}
            {session.place && ` · ${session.place}`}
          </p>
          <p>
            {session.registered} inscrit{session.registered > 1 ? "s" : ""}
            {session.capacity !== null && ` pour ${String(session.capacity)} places`}
          </p>
          {session.pegassUrl && (
            <a
              href={session.pegassUrl}
              className="text-ink underline"
              rel="noopener noreferrer"
              target="_blank"
            >
              Voir dans Pegass
            </a>
          )}
          {session.cancelledAt && (
            <p className="text-danger-ink">
              Session annulée{session.cancelReason ? ` : ${session.cancelReason}` : ""}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle as="h2">Inscrits et résultats</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {session.lines.length === 0 ? (
            <p className="text-body text-muted">Personne n&apos;est inscrit.</p>
          ) : (
            <>
              <ul className="flex flex-col divide-y divide-line">
                {session.lines.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span className="flex flex-col">
                      <Link
                        href={`/benevoles/${l.ref}?onglet=formations`}
                        className="text-body text-ink underline-offset-4 hover:underline"
                      >
                        {name(l)}
                      </Link>
                      <span className="text-small text-ink-2">
                        {TRAINING_RESULT_LABELS[l.result]}
                        {l.cancelledAt && " · annulée"}
                      </span>
                    </span>
                    {!l.cancelledAt && (
                      <CancelDialog
                        id={l.id}
                        what="record"
                        label={`${session.code} de ${name(l)}`}
                      />
                    )}
                  </li>
                ))}
              </ul>
              <ResultsForm
                lines={session.lines.map((l) => ({
                  id: l.id,
                  name: name(l),
                  result: l.result,
                  cancelled: l.cancelledAt !== null,
                }))}
              />
            </>
          )}
        </CardContent>
      </Card>
      {!session.cancelledAt && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">Inscrire des personnes</CardTitle>
          </CardHeader>
          <CardContent>
            <GroupEntryForm
              trainings={[]}
              fixedTraining={{ id: session.referenceId, code: session.code, label: session.label }}
              people={people}
              sessionId={session.id}
            />
          </CardContent>
        </Card>
      )}
      {session.waiting.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle as="h2">En attente pour {session.code}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1">
              {session.waiting.map((w) => (
                <li key={w.id} className="text-body text-ink">
                  {w.firstName} {w.lastName}
                  {w.priority > 0 && ` · priorité ${String(w.priority)}`}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-small text-muted">
              Inscription depuis « Listes d&apos;attente ».
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
