import { formatDate } from "./dates";

/**
 * Timeline of a person (Historique tab). Types and pure ordering, shared by
 * the server (`src/server/timeline.ts`) and the client filter. Client-safe.
 */

export const TIMELINE_TYPES = [
  "entry",
  "status",
  "candidacy",
  "training",
  "appointment",
  "followUp",
  "mentorship",
  "document",
  "import",
] as const;

export type TimelineType = (typeof TIMELINE_TYPES)[number];

export const TIMELINE_TYPE_LABELS: Record<TimelineType, string> = {
  entry: "Entrée et départ",
  status: "Statut",
  candidacy: "Candidature",
  training: "Formations",
  appointment: "Fonctions",
  followUp: "Points de suivi",
  mentorship: "Parrainages",
  document: "Documents",
  import: "Import",
};

export interface TimelineEvent {
  /** Stable key (type + source id + variant). */
  id: string;
  type: TimelineType;
  /** Calendar day or instant; null when unknown (frequent for imported trainings). */
  date: Date | null;
  title: string;
  detail?: string | null;
}

export interface TimelineGroup {
  /** « 2026 », or null for the « Date inconnue » section. */
  year: string | null;
  events: TimelineEvent[];
}

/** Most recent first; events without date last, in a stable order. */
export function sortTimeline(events: readonly TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => {
    if (a.date && b.date) return b.date.getTime() - a.date.getTime() || a.id.localeCompare(b.id);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title, "fr") || a.id.localeCompare(b.id);
  });
}

/** Year of an event in the Paris time zone. */
function parisYear(date: Date): string {
  return formatDate(date).slice(-4);
}

/** Groups sorted events by year, with a final « Date inconnue » section. */
export function groupTimeline(events: readonly TimelineEvent[]): TimelineGroup[] {
  const groups: TimelineGroup[] = [];
  const unknown: TimelineEvent[] = [];
  for (const event of sortTimeline(events)) {
    if (!event.date) {
      unknown.push(event);
      continue;
    }
    const year = parisYear(event.date);
    const last = groups.at(-1);
    if (last?.year === year) last.events.push(event);
    else groups.push({ year, events: [event] });
  }
  if (unknown.length > 0) groups.push({ year: null, events: unknown });
  return groups;
}
