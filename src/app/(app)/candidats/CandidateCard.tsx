import Link from "next/link";
import { FollowUpDot } from "@/components/person/FollowUpDot";
import { Chip } from "@/components/ui/Chip";
import { CANDIDACY_STAGE_LABELS } from "@/lib/labels";
import type { CandidateCard as Card } from "@/server/services/candidacies";

/** One candidate on the board: name, stage, next action, follow-up, owner, idle days. */
export function CandidateCard({ card, showStage }: { card: Card; showStage: boolean }) {
  return (
    <article className="flex flex-col gap-2 rounded-inner border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-body font-semibold text-ink">
          <Link
            href={`/benevoles/${card.ref}?onglet=integration`}
            className="rounded-inner underline-offset-4 focus-ring hover:underline"
          >
            {card.firstName} {card.lastName}
          </Link>
        </h3>
        {card.legacyRef && (
          <span className="font-mono text-mono text-muted" title="Identifiant de l'ancien classeur">
            {card.legacyRef}
          </span>
        )}
      </div>
      {showStage && <p className="text-small text-ink-2">{CANDIDACY_STAGE_LABELS[card.stage]}</p>}
      {card.stage === "GAIA" && (
        <Chip tone="accent" className="self-start" data-testid="gaia-tag">
          À créer dans Gaia
        </Chip>
      )}
      {card.nextAction && <p className="text-small text-ink">{card.nextAction}</p>}
      {card.stage !== "ABANDONED" && <FollowUpDot state={card.followUp} date={card.followUpAt} />}
      <p className="text-small text-muted">
        {card.owner ?? "Sans responsable"} ·{" "}
        {card.idleDays === 0
          ? "action aujourd'hui"
          : `${String(card.idleDays)} jour${card.idleDays > 1 ? "s" : ""} sans action`}
      </p>
    </article>
  );
}
