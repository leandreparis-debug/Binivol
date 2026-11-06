import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { formatDate } from "@/lib/dates";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { StatusDot } from "@/components/ui/StatusDot";
import { listRecentEnrolments, type RecentEnrolment } from "@/server/services/dlusDashboard";
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

const ENROLMENT_KEY = {
  REGISTERED: "enrol-registered",
  WAITLISTED: "enrol-waitlisted",
  CONFIRMED: "enrol-confirmed",
} as const;

/** « Inscriptions récentes » (from the DLUS dashboard, step 16): date, person, training, session, status. */
function RecentEnrolments({ rows }: { rows: RecentEnrolment[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2">Inscriptions récentes</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-body text-muted">Aucune inscription.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line" data-testid="recent-enrolments">
            {rows.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  {e.person.ref ? (
                    <Link
                      href={`/benevoles/${e.person.ref}`}
                      className="rounded-inner text-body font-medium text-ink underline-offset-4 focus-ring hover:underline"
                    >
                      {e.person.name}
                    </Link>
                  ) : (
                    <span className="text-body font-medium text-ink">{e.person.name}</span>
                  )}
                  <span className="text-small text-ink-2">
                    {e.training} · inscrit le {formatDate(e.at)}
                    {e.sessionDate && ` · session du ${formatDate(e.sessionDate)}`}
                  </span>
                </span>
                <StatusDot status={ENROLMENT_KEY[e.status]} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function SessionsPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageAccess("trainingSession.manage");
  const db = getDb();
  const recent = (await searchParams).inscriptions === "recentes";
  const [upcoming, past, trainings, enrolments] = await Promise.all([
    listSessions(db, actor, "upcoming"),
    listSessions(db, actor, "past"),
    referenceOptions(db, { kind: "TRAINING" }),
    recent ? listRecentEnrolments(db, actor) : Promise.resolve(null),
  ]);
  return (
    <>
      {enrolments && <RecentEnrolments rows={enrolments} />}
      <NewSessionDialog
        trainings={trainings.map((t) => ({ id: t.id, code: t.code, label: t.label }))}
      />
      <SessionList title="Sessions à venir" rows={upcoming} cancellable />
      <SessionList title="Sessions passées" rows={past} cancellable={false} />
    </>
  );
}
