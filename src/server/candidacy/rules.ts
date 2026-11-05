/**
 * Pure rules of the integration screens: follow-up delays, idle days,
 * grouped sources, ranking of the proposed mentors. Dates are calendar days
 * at 00:00 UTC (`toParisDay()`), instants are converted by the caller.
 */

const DAY_MS = 86_400_000;

/** `overdue`: the follow-up date is past; `today`: it is today; `planned`; `none`. */
export type FollowUpState = "overdue" | "today" | "planned" | "none";

export function followUpState(followUpAt: Date | null | undefined, day: Date): FollowUpState {
  if (!followUpAt) return "none";
  const diff = Math.round((followUpAt.getTime() - day.getTime()) / DAY_MS);
  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  return "planned";
}

/** Whole days between the last event (a calendar day) and `day`; 0 at least. */
export function idleDays(lastEventDay: Date, day: Date): number {
  return Math.max(0, Math.round((day.getTime() - lastEventDay.getTime()) / DAY_MS));
}

/** Default follow-up date after a change of stage: `day` + N days. */
export function defaultFollowUp(day: Date, days: number): Date {
  return new Date(day.getTime() + days * DAY_MS);
}

/** Default next action proposed after reaching a stage. */
export const DEFAULT_NEXT_ACTIONS: Record<string, string> = {
  FIRST_CONTACT: "Proposer une rencontre à l'unité locale",
  MEETING: "Faire le point après la rencontre",
  CONFIRMED: "Envoyer le dossier bénévole",
  FILE: "Vérifier le dossier signé",
  GAIA: "Créer le compte Gaia et obtenir le NIVOL",
};

function sourceKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Source suggestions: existing sources grouped without case nor accents
 * (« Site internet » and « Site Internet » are one), the most frequent
 * spelling kept (the first seen among equals), ordered by use then alphabetically.
 */
export function groupSources(sources: readonly (string | null)[]): string[] {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const raw of sources) {
    const value = raw?.replace(/\s+/g, " ").trim();
    if (!value) continue;
    const key = sourceKey(value);
    const group = groups.get(key) ?? { count: 0, spellings: new Map<string, number>() };
    group.count += 1;
    group.spellings.set(value, (group.spellings.get(value) ?? 0) + 1);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => {
      // Stable sort: among equally used spellings, the first seen wins.
      const [spelling] = [...g.spellings.entries()].sort((a, b) => b[1] - a[1])[0] ?? [""];
      return { spelling, count: g.count };
    })
    .sort((a, b) => b.count - a.count || a.spelling.localeCompare(b.spelling, "fr"))
    .map((g) => g.spelling);
}

/** Matches a typed source with an existing one (same key), or keeps it as typed. */
export function canonicalSource(value: string | null, existing: readonly string[]): string | null {
  const typed = value?.replace(/\s+/g, " ").trim();
  if (!typed) return null;
  return existing.find((s) => sourceKey(s) === sourceKey(typed)) ?? typed;
}

export interface MentorCandidate {
  id: string;
  /** Current mentees (mentorship not ended). */
  activeMentees: number;
  /** Entry date; null (unknown) ranks last among equals. */
  entryDate: Date | null;
  lastName: string;
  firstName: string;
}

/**
 * Proposed mentors: fewest current mentees first, then the longest seniority
 * (earliest entry date), then by name.
 */
export function rankMentors<T extends MentorCandidate>(candidates: readonly T[]): T[] {
  return [...candidates].sort((a, b) => {
    if (a.activeMentees !== b.activeMentees) return a.activeMentees - b.activeMentees;
    const ea = a.entryDate?.getTime() ?? Number.POSITIVE_INFINITY;
    const eb = b.entryDate?.getTime() ?? Number.POSITIVE_INFINITY;
    if (ea !== eb) return ea - eb;
    return (
      a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr")
    );
  });
}
