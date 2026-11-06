import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BarChart } from "@/components/ui/BarChart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { CANDIDACY_STAGE_LABELS, PROFILE_LABELS } from "@/lib/labels";
import type { DashboardBlock } from "@/server/services/dashboard";

/**
 * The blocks of the home page (step 13), one per profile of the user. Only
 * the very first key figure of the screen is the highlighted one.
 */
export function DashboardBlocks({ blocks }: { blocks: DashboardBlock[] }) {
  return (
    <div className="flex flex-col gap-8">
      {blocks.map((block, b) => (
        <section
          key={block.profile}
          aria-labelledby={`block-${block.profile}`}
          className="flex flex-col gap-4"
          data-testid={`dashboard-${block.profile}`}
        >
          <h2 id={`block-${block.profile}`} className="text-section text-ink">
            {block.title}{" "}
            <span className="text-body font-normal text-muted">
              ({PROFILE_LABELS[block.profile]})
            </span>
          </h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {block.stats.map((s, i) => (
              <li key={s.label}>
                {s.href ? (
                  <Link href={s.href} className="block hover-lift rounded-card focus-ring">
                    <StatCard
                      variant={b === 0 && i === 0 ? "highlight" : "default"}
                      label={s.label}
                      value={String(s.value)}
                      footer={s.hint}
                    />
                  </Link>
                ) : (
                  <StatCard
                    variant={b === 0 && i === 0 ? "highlight" : "default"}
                    label={s.label}
                    value={String(s.value)}
                    footer={s.hint}
                  />
                )}
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle as="h3">{block.todoTitle}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {block.todo.length === 0 ? (
                  <p className="text-body text-muted">Rien à faire.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-line">
                    {block.todo.map((t, i) => (
                      <li key={`${t.href}-${String(i)}`} className="flex flex-col py-2">
                        <Link
                          href={t.href}
                          className="inline-flex min-h-11 items-center text-body text-ink underline-offset-4 focus-ring hover:underline"
                        >
                          {t.label}
                        </Link>
                        <span className="text-small text-ink-2">{t.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <Link
                  href={block.todoHref}
                  className="inline-flex min-h-11 items-center gap-2 self-start text-small font-medium text-ink underline-offset-4 focus-ring hover:underline"
                >
                  Tout voir <ArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </CardContent>
            </Card>
            {(block.charts.length > 0 || block.cohorts) && (
              <Card>
                <CardContent className="flex flex-col gap-6 pt-6">
                  {block.charts.map((c) => (
                    <BarChart
                      key={c.title}
                      title={c.title}
                      data={c.data}
                      primaryLabel={c.primaryLabel}
                      {...(c.secondaryLabel ? { secondaryLabel: c.secondaryLabel } : {})}
                    />
                  ))}
                  {block.funnel && (
                    <p className="text-small text-ink-2">
                      Durée moyenne par étape :{" "}
                      {block.funnel
                        .map(
                          (s) =>
                            `${CANDIDACY_STAGE_LABELS[s.stage]} ${s.averageDays === null ? "n. c." : `${String(s.averageDays)} j`}`,
                        )
                        .join(" · ")}
                    </p>
                  )}
                  {block.cohorts && (
                    <BarChart
                      title="Fidélisation : encore présents 12 mois après l'entrée"
                      primaryLabel="restés"
                      secondaryLabel="partis"
                      data={block.cohorts.map((c) => ({
                        label: c.label,
                        primary: c.retained,
                        secondary: c.entered - c.retained,
                        note: c.rate === null ? "n. c." : `${String(c.rate)} %`,
                      }))}
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
