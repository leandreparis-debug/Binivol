import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BarChart } from "@/components/ui/BarChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { FlowChart } from "@/components/ui/FlowChart";
import { StatCard } from "@/components/ui/StatCard";
import { StatusDot } from "@/components/ui/StatusDot";
import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { CANDIDACY_STAGE_LABELS } from "@/lib/labels";
import {
  ARRIVAL_ACTIVITY_LABELS,
  ARRIVAL_PERIOD_LABELS,
  ARRIVAL_PERIODS,
  type ArrivalPeriod,
} from "@/server/dashboard/aggregates";
import type { DlusDashboard as Dashboard, EnrolmentStatus } from "@/server/services/dlusDashboard";

const ENROLMENT_KEY: Record<
  EnrolmentStatus,
  "enrol-registered" | "enrol-waitlisted" | "enrol-confirmed"
> = {
  REGISTERED: "enrol-registered",
  WAITLISTED: "enrol-waitlisted",
  CONFIRMED: "enrol-confirmed",
};

function signed(n: number): string {
  return n > 0 ? `+${String(n)}` : n < 0 ? `−${String(-n)}` : "0";
}

/**
 * The DLUS overview (TOPAZE home page, step 16): operational strength (one
 * highlighted figure: « Secouristes »), the latest enrolments, the arrivals.
 * Every figure opens the directory filtered on the people it counts.
 * Computer: figures on top, Arrivées 2/3 and Inscriptions 1/3; tablet: two
 * columns; phone: one column, figures in a 2-column grid.
 */
export function DlusDashboard({ data }: { data: Dashboard }) {
  const { indicators, enrolments, arrivals } = data;
  return (
    <div className="flex flex-col gap-8" data-testid="dlus-dashboard">
      <section aria-labelledby="dlus-effectifs" className="flex flex-col gap-4">
        <h2 id="dlus-effectifs" className="text-section text-ink">
          Effectifs opérationnels
        </h2>
        <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
          {indicators.map((ind, i) => (
            <li key={ind.key}>
              <Link
                href={ind.href}
                className="block h-full hover-lift rounded-card focus-ring"
                data-testid={`indicator-${ind.key}`}
              >
                <StatCard
                  className="h-full"
                  variant={i === 0 ? "highlight" : "default"}
                  label={ind.label}
                  value={String(ind.value)}
                  arrow
                  delta={signed(ind.variation)}
                  deltaTone={ind.variation > 0 ? "up" : ind.variation < 0 ? "down" : "neutral"}
                  footer={`depuis le ${ind.since}${ind.detail ? ` · ${ind.detail.label} : ${String(ind.detail.value)}` : ""}`}
                  extra={
                    ind.expiring ? (
                      <StatusDot
                        status="soon"
                        label={`${String(ind.expiring)} expire${ind.expiring > 1 ? "nt" : ""} sous 60 jours`}
                        className={i === 0 ? "text-white" : undefined}
                      />
                    ) : undefined
                  }
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
        <section aria-labelledby="dlus-arrivees" className="md:col-span-2 lg:col-span-2">
          <Card className="flex flex-col gap-6">
            <CardHeader className="mb-0">
              <CardTitle as="h2" id="dlus-arrivees">
                Arrivées
              </CardTitle>
              <nav aria-label="Période des arrivées" className="flex flex-wrap gap-1">
                {ARRIVAL_PERIODS.map((p: ArrivalPeriod) => (
                  <Link
                    key={p}
                    href={p === "12mois" ? "/" : `/?periode=${p}`}
                    scroll={false}
                    aria-current={arrivals.period === p ? "true" : undefined}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-mark px-4 text-small font-medium focus-ring",
                      arrivals.period === p
                        ? "bg-ink text-white"
                        : "bg-veil text-ink hover:bg-line",
                    )}
                  >
                    {ARRIVAL_PERIOD_LABELS[p]}
                  </Link>
                ))}
              </nav>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  ["Arrivées depuis le 1er janvier", String(arrivals.arrivalsSinceJanuary)],
                  ["Arrivées sur 12 mois", String(arrivals.arrivalsLast12Months)],
                  [
                    "Délai médian candidature → bénévole",
                    arrivals.medianDays === null ? "n. c." : `${String(arrivals.medianDays)} j`,
                  ],
                  [
                    "Taux de transformation (12 mois)",
                    arrivals.conversionRate === null
                      ? "n. c."
                      : `${String(arrivals.conversionRate)} %`,
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex flex-col gap-1 rounded-inner bg-veil/60 p-3">
                    <dt className="text-small text-ink-2">{label}</dt>
                    <dd className="font-display text-section text-ink tabular-nums">{value}</dd>
                  </div>
                ))}
              </dl>
              <FlowChart
                title={`Arrivées et départs par mois (${ARRIVAL_PERIOD_LABELS[arrivals.period].toLowerCase()})`}
                data={arrivals.months}
              />
              <section aria-labelledby="dlus-entonnoir" className="flex flex-col gap-2">
                <h3 id="dlus-entonnoir" className="text-body font-semibold text-ink">
                  Candidatures en cours, par étape
                </h3>
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {arrivals.funnel.map((s) => (
                    <li key={s.stage}>
                      <Link
                        href={s.href}
                        className="flex min-h-11 flex-col rounded-inner border border-line px-3 py-2 focus-ring hover:bg-veil"
                      >
                        <span className="text-small text-ink-2">
                          {CANDIDACY_STAGE_LABELS[s.stage]}
                        </span>
                        <span className="font-display text-section text-ink tabular-nums">
                          {s.count}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
              <BarChart
                title="Arrivées sur 12 mois par activité"
                primaryLabel="arrivées"
                data={arrivals.byActivity.map((a) => ({
                  label: ARRIVAL_ACTIVITY_LABELS[a.activity],
                  primary: a.count,
                }))}
              />
              <BarChart
                title="Fidélisation : encore présents 12 mois après l'entrée"
                primaryLabel="restés"
                secondaryLabel="partis"
                data={arrivals.cohorts.map((c) => ({
                  label: c.label,
                  primary: c.retained,
                  secondary: c.entered - c.retained,
                  note: c.rate === null ? "n. c." : `${String(c.rate)} %`,
                }))}
              />
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="dlus-inscriptions" className="md:col-span-2 lg:col-span-1">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle as="h2" id="dlus-inscriptions">
                Dernières inscriptions en formation
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {enrolments.length === 0 ? (
                <p className="text-body text-muted">Aucune inscription.</p>
              ) : (
                <ul className="flex flex-col gap-2" data-testid="dlus-enrolments">
                  {enrolments.map((e) => (
                    <li
                      key={e.id}
                      className="flex flex-col gap-1 rounded-inner bg-veil/60 px-4 py-3"
                    >
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        {e.person.ref ? (
                          <Link
                            href={`/benevoles/${e.person.ref}`}
                            className="inline-flex min-h-11 items-center text-body font-semibold text-ink underline-offset-4 focus-ring hover:underline"
                          >
                            {e.person.name}
                          </Link>
                        ) : (
                          <span className="text-body font-semibold text-ink">{e.person.name}</span>
                        )}
                        <StatusDot status={ENROLMENT_KEY[e.status]} />
                      </span>
                      <span className="text-small text-ink-2">{e.training}</span>
                      <span className="text-small text-muted">
                        Inscrit le <span className="font-mono">{formatDate(e.at)}</span>
                        {e.sessionDate && (
                          <>
                            {" · session du "}
                            <span className="font-mono">{formatDate(e.sessionDate)}</span>
                          </>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href="/formations/sessions?inscriptions=recentes"
                className="inline-flex min-h-11 items-center gap-2 self-start text-small font-medium text-ink underline-offset-4 focus-ring hover:underline"
              >
                Tout voir <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
