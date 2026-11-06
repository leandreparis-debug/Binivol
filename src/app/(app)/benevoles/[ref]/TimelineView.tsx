"use client";

import { useMemo, useState } from "react";
import {
  ArrowRightLeft,
  Award,
  CalendarCheck,
  DoorOpen,
  FileText,
  Handshake,
  History,
  Upload,
  UserPlus,
} from "lucide-react";
import { formatDate } from "@/lib/dates";
import {
  groupTimeline,
  TIMELINE_TYPE_LABELS,
  type TimelineEvent,
  type TimelineType,
} from "@/lib/timeline";
import { cn } from "@/lib/cn";

const ICONS: Record<TimelineType, typeof History> = {
  entry: DoorOpen,
  status: ArrowRightLeft,
  candidacy: UserPlus,
  training: Award,
  appointment: CalendarCheck,
  followUp: History,
  mentorship: Handshake,
  document: FileText,
  import: Upload,
};

/** Historique tab: events grouped by year, « Date inconnue » last, filter by type. */
export function TimelineView({ events }: { events: TimelineEvent[] }) {
  const types = useMemo(() => [...new Set(events.map((e) => e.type))], [events]);
  const [hidden, setHidden] = useState<Set<TimelineType>>(new Set());
  const groups = groupTimeline(events.filter((e) => !hidden.has(e.type)));

  if (events.length === 0) return <p className="text-body text-muted">Aucun événement.</p>;
  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="mb-2 text-small font-medium text-ink">Types d&apos;événement</legend>
        <div className="flex flex-wrap gap-2">
          {types.map((type) => {
            const shown = !hidden.has(type);
            const Icon = ICONS[type];
            return (
              <button
                key={type}
                type="button"
                aria-pressed={shown}
                onClick={() => {
                  setHidden((prev) => {
                    const next = new Set(prev);
                    if (next.has(type)) next.delete(type);
                    else next.add(type);
                    return next;
                  });
                }}
                className={cn(
                  "inline-flex h-11 items-center gap-2 rounded-control border px-4 text-small font-medium focus-ring",
                  shown ? "border-ink bg-ink text-white" : "border-line bg-surface text-ink-2",
                )}
              >
                <Icon aria-hidden="true" className="size-4" />
                {TIMELINE_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
      </fieldset>
      {groups.map((group) => (
        <section key={group.year ?? "unknown"} aria-labelledby={`year-${group.year ?? "unknown"}`}>
          <h3 id={`year-${group.year ?? "unknown"}`} className="mb-2 text-section text-ink">
            {group.year ?? "Date inconnue"}
          </h3>
          <ol className="flex flex-col border-l border-line">
            {group.events.map((event) => {
              const Icon = ICONS[event.type];
              return (
                <li key={event.id} className="relative flex gap-3 py-2 pl-6">
                  <span
                    aria-hidden="true"
                    className="absolute top-3 -left-3 inline-flex size-6 items-center justify-center rounded-pill bg-veil text-ink-2"
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-body text-ink">{event.title}</span>
                    {event.detail && <span className="text-small text-ink-2">{event.detail}</span>}
                    <span className="text-small text-muted">
                      {TIMELINE_TYPE_LABELS[event.type]}
                      {event.date && (
                        <>
                          {" · "}
                          <span className="font-mono text-mono">{formatDate(event.date)}</span>
                        </>
                      )}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}
