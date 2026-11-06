import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatDate, toParisDay } from "@/lib/dates";
import { getEnv } from "@/lib/env";
import { FOLLOW_UP_KIND_LABELS } from "@/lib/labels";
import { requirePageAccess } from "@/server/auth/page";
import { getDb } from "@/server/db";
import { canSome } from "@/server/policy/can";
import { b3ToCheck } from "@/server/sensitive";
import { followUpBoard, mentorshipBoard, type BoardFollowUp } from "@/server/services/followUps";
import { EndMentorship } from "../../benevoles/[ref]/IntegrationPanel";

export const metadata: Metadata = { title: "Suivi des bénévoles" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const BUCKETS = [
  { key: "overdue", title: "En retard" },
  { key: "week", title: "Cette semaine" },
  { key: "month", title: "Ce mois-ci" },
] as const;

function FollowUpList({ rows }: { rows: BoardFollowUp[] }) {
  if (rows.length === 0) return <p className="text-body text-muted">Aucun point.</p>;
  return (
    <ul className="flex flex-col divide-y divide-line">
      {rows.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <span className="flex flex-col">
            <Link
              href={`/benevoles/${f.ref}?onglet=suivi`}
              className="text-body text-ink underline-offset-4 focus-ring hover:underline"
            >
              {f.firstName} {f.lastName}
            </Link>
            <span className="text-small text-ink-2">
              {FOLLOW_UP_KIND_LABELS[f.kind]} · prévu le {formatDate(f.scheduledAt)}
              {f.owner ? ` · ${f.owner}` : ""}
            </span>
          </span>
          {f.bucket === "overdue" ? (
            <StatusDot status="expired" label="En retard" />
          ) : (
            <StatusDot status="soon" label="À venir" />
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Follow-up of the volunteers (step 11, DIAMANT and TOPAZE): points overdue,
 * this week, this month; mentorships in progress; B3 to check (TOPAZE). A
 * section of /candidats: same people in charge, no new entry in the main
 * navigation (docs/suivi.md).
 */
export default async function FollowUpPage({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageAccess("followUp.manage");
  const raw = await searchParams;
  const owner = (Array.isArray(raw.responsable) ? raw.responsable[0] : raw.responsable) ?? "all";
  const day = toParisDay();
  const db = getDb();
  const [points, mentorships, b3] = await Promise.all([
    followUpBoard(db, actor, { owner: owner === "moi" ? "me" : "all" }, day),
    canSome(actor, "mentorship.manage") ? mentorshipBoard(db, actor, day) : Promise.resolve([]),
    canSome(actor, "b3.manage") ? b3ToCheck(db, actor, day) : Promise.resolve(null),
  ]);
  const todayIso = day.toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title="Suivi des bénévoles"
        subtitle="Points de suivi, parrainages et B3."
        actions={getEnv().AUTH_DEMO_LOGIN ? <FakeDataBanner /> : undefined}
      />
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Link
          href="/candidats"
          className="inline-flex min-h-11 items-center gap-2 rounded-control text-small text-ink-2 focus-ring hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-4" /> Candidats
        </Link>
        <nav aria-label="Filtre des points" className="flex flex-wrap gap-2">
          <Link
            href="/candidats/suivi"
            aria-current={owner !== "moi" ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-control px-4 text-body focus-ring aria-[current=page]:bg-ink aria-[current=page]:text-white"
          >
            Tous les responsables
          </Link>
          <Link
            href="/candidats/suivi?responsable=moi"
            aria-current={owner === "moi" ? "page" : undefined}
            className="inline-flex min-h-11 items-center rounded-control px-4 text-body focus-ring aria-[current=page]:bg-ink aria-[current=page]:text-white"
          >
            Mes candidats
          </Link>
        </nav>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3" data-testid="follow-up-board">
        {BUCKETS.map((b) => (
          <Card key={b.key}>
            <CardHeader>
              <CardTitle as="h2">
                {b.title} ({points.filter((p) => p.bucket === b.key).length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FollowUpList rows={points.filter((p) => p.bucket === b.key)} />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="mt-6">
        <CardHeader>
          <CardTitle as="h2">Parrainages en cours ({mentorships.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {mentorships.length === 0 ? (
            <p className="text-body text-muted">Aucun parrainage en cours.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {mentorships.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <span className="flex flex-col gap-1">
                    <span className="text-body text-ink">
                      <Link
                        href={`/benevoles/${m.menteeRef}?onglet=suivi`}
                        className="underline-offset-4 hover:underline"
                      >
                        {m.mentee}
                      </Link>{" "}
                      parrainé(e) par {m.mentor}
                    </span>
                    <span className="text-small text-ink-2">
                      Depuis le {formatDate(m.startDate)} · dernier point :{" "}
                      {m.lastFollowUpAt ? formatDate(m.lastFollowUpAt) : "aucun"}
                    </span>
                    {m.endSuggested && (
                      <Chip tone="warn" className="self-start">
                        Fin proposée (plus de 12 mois)
                      </Chip>
                    )}
                  </span>
                  <EndMentorship mentorship={{ id: m.id, mentorName: m.mentor }} today={todayIso} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {b3 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle as="h2">B3 à vérifier cette année ({b3.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {b3.length === 0 ? (
              <p className="text-body text-muted">Tous les encadrants de mineurs sont vérifiés.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line" data-testid="b3-to-check">
                {b3.map((p) => (
                  <li
                    key={p.personId}
                    className="flex flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <Link
                      href={`/benevoles/${p.ref}?onglet=suivi`}
                      className="text-body text-ink underline-offset-4 hover:underline"
                    >
                      {p.firstName} {p.lastName}
                    </Link>
                    <span className="text-small text-ink-2">
                      {p.lastCheckedAt
                        ? `Dernière vérification le ${formatDate(p.lastCheckedAt)}`
                        : "Jamais vérifié"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
