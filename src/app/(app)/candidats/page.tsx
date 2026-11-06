import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CheckCircle2, UserPlus } from "lucide-react";
import { FakeDataBanner } from "@/components/layout/FakeDataBanner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { getEnv } from "@/lib/env";
import { CANDIDACY_STAGE_LABELS } from "@/lib/labels";
import { requirePageAccess } from "@/server/auth/page";
import { OPEN_STAGES } from "@/server/candidacy/machine";
import { getDb } from "@/server/db";
import { can, canSome } from "@/server/policy/can";
import { candidacyBoard, type CandidateCard as Card } from "@/server/services/candidacies";
import { BoardFilters } from "./BoardFilters";
import { CandidateCard } from "./CandidateCard";
import { NewCandidateDialog } from "./NewCandidateDialog";

export const metadata: Metadata = { title: "Candidats" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Overdue first, then the nearest follow-up. */
function urgency(a: Card, b: Card): number {
  const rank = { overdue: 0, today: 1, planned: 2, none: 3 } as const;
  return (
    rank[a.followUp] - rank[b.followUp] ||
    (a.followUpAt?.getTime() ?? Infinity) - (b.followUpAt?.getTime() ?? Infinity)
  );
}

/**
 * /candidats (DIAMANT, TOPAZE): figures per stage, overdue follow-ups and
 * integrations of the last 12 months; columns per stage on desktop, a list
 * grouped by stage on mobile. Stages change through the buttons of the
 * person page (« Intégration » tab), never by drag and drop.
 */
export default async function Page({ searchParams }: { searchParams: SearchParams }) {
  const actor = await requirePageAccess("candidacy.manage");
  const raw = await searchParams;
  const owner = first(raw.responsable);
  const board = await candidacyBoard(getDb(), actor, {
    owner: owner === "tous" ? "all" : owner && /^[a-z0-9_]{5,40}$/i.test(owner) ? owner : "me",
    overdueOnly: first(raw.retard) === "1",
    source: first(raw.source)?.slice(0, 100) ?? null,
    showAbandoned: first(raw.abandons) === "1",
    gaiaOnly: first(raw.gaia) === "1",
  });
  // `?etape=` (from the DLUS dashboard funnel, step 16): that stage only.
  const onlyStage = OPEN_STAGES.find((s) => s === first(raw.etape));
  const stages = onlyStage
    ? [onlyStage]
    : [...OPEN_STAGES, ...(first(raw.abandons) === "1" ? (["ABANDONED"] as const) : [])];
  const byStage = (stage: string) => board.cards.filter((c) => c.stage === stage).sort(urgency);
  const canCreate = can(actor, "candidacy.create").allowed;
  const canFollow = canSome(actor, "followUp.manage");

  return (
    <>
      <PageHeader
        title="Candidats"
        subtitle="Suivi des candidats et de leur intégration."
        actions={
          <>
            {getEnv().AUTH_DEMO_LOGIN && <FakeDataBanner />}
            {canFollow && (
              <Button asChild variant="outline">
                <Link href="/candidats/suivi">Suivi des bénévoles</Link>
              </Button>
            )}
            {canCreate && <NewCandidateDialog sources={board.sources} />}
          </>
        }
      />

      <section
        aria-label="Chiffres clés"
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7"
      >
        {OPEN_STAGES.map((stage) => (
          <StatCard
            key={stage}
            label={CANDIDACY_STAGE_LABELS[stage]}
            value={board.stats.byStage[stage]}
          />
        ))}
        <StatCard
          variant="highlight"
          label="Relances en retard"
          value={board.stats.overdue}
          icon={<AlarmClock aria-hidden="true" />}
        />
        <StatCard
          variant="dark"
          label="Intégrés sur 12 mois"
          value={board.stats.finalizedLast12Months}
          icon={<CheckCircle2 aria-hidden="true" />}
        />
      </section>

      <div className="mb-6">
        <BoardFilters owners={board.owners} sources={board.sources} />
      </div>

      {board.cards.length === 0 ? (
        <EmptyState
          icon={<UserPlus />}
          title="Aucun candidat"
          description="Aucune candidature ne correspond à ces filtres."
        />
      ) : (
        <>
          {/* Desktop: one column per stage. */}
          <div
            className="hidden gap-3 lg:grid"
            style={{ gridTemplateColumns: `repeat(${String(stages.length)}, minmax(0, 1fr))` }}
          >
            {stages.map((stage) => (
              <section
                key={stage}
                aria-labelledby={`col-${stage}`}
                className="flex flex-col gap-3 rounded-card border border-line p-3"
              >
                <h2
                  id={`col-${stage}`}
                  className="flex items-center justify-between px-1 text-small font-medium text-ink"
                >
                  {CANDIDACY_STAGE_LABELS[stage]}
                  <span className="font-mono text-mono text-muted">{byStage(stage).length}</span>
                </h2>
                {byStage(stage).map((card) => (
                  <CandidateCard key={card.candidacyId} card={card} showStage={false} />
                ))}
              </section>
            ))}
          </div>
          {/* Mobile: grouped by stage, overdue first. */}
          <div className="flex flex-col gap-6 lg:hidden">
            {board.cards.some((c) => c.followUp === "overdue") && (
              <section aria-labelledby="mobile-overdue" className="flex flex-col gap-3">
                <h2 id="mobile-overdue" className="text-section text-ink">
                  En retard
                </h2>
                {board.cards
                  .filter((c) => c.followUp === "overdue")
                  .sort(urgency)
                  .map((card) => (
                    <CandidateCard key={card.candidacyId} card={card} showStage />
                  ))}
              </section>
            )}
            {stages.map((stage) => {
              const cards = byStage(stage).filter((c) => c.followUp !== "overdue");
              if (cards.length === 0) return null;
              return (
                <section
                  key={stage}
                  aria-labelledby={`mobile-${stage}`}
                  className="flex flex-col gap-3"
                >
                  <h2 id={`mobile-${stage}`} className="text-section text-ink">
                    {CANDIDACY_STAGE_LABELS[stage]}
                  </h2>
                  {cards.map((card) => (
                    <CandidateCard key={card.candidacyId} card={card} showStage={false} />
                  ))}
                </section>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
