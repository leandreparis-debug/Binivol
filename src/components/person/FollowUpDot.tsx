import { cn } from "@/lib/cn";
import { formatDate } from "@/lib/dates";
import { dotToneClasses } from "@/components/ui/StatusDot";

export type FollowUpTone = "overdue" | "today" | "planned" | "none";

const META: Record<FollowUpTone, { label: string; tone: keyof typeof dotToneClasses }> = {
  overdue: { label: "Relance en retard", tone: "danger" },
  today: { label: "Relance aujourd'hui", tone: "warn" },
  planned: { label: "Relance prévue", tone: "ok" },
  none: { label: "Pas de relance", tone: "neutral" },
};

/** Follow-up of a candidacy: a dot **and** a label, with the date in mono. */
export function FollowUpDot({
  state,
  date,
  className,
}: {
  state: FollowUpTone;
  date: Date | null;
  className?: string;
}) {
  const meta = META[state];
  return (
    <span
      className={cn("inline-flex items-center gap-2 text-small text-ink", className)}
      data-follow-up={state}
    >
      <span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 rounded-pill", dotToneClasses[meta.tone])}
      />
      <span>
        {meta.label}
        {date && <span className="font-mono text-mono text-muted"> {formatDate(date)}</span>}
      </span>
    </span>
  );
}
