/**
 * « À faire » (step 16), client-safe helpers: the quick-add parser and the
 * grouping of a list. Days are ISO calendar days (`AAAA-MM-JJ`) in the Paris
 * time zone; `today` is always passed in, so everything here is pure.
 */

export const TODO_TITLE_MAX = 200;
export const TODO_NOTE_MAX = 2000;
export const TODO_COMMENT_MAX = 1000;
export const PROJECT_NAME_MAX = 80;
export const PROJECT_DESCRIPTION_MAX = 1000;

/** Archived tasks and projects can be restored for this long. */
export const RESTORE_WINDOW_DAYS = 30;

/** Colours a project may take: design tokens only (`TodoProjectColor`). */
export const PROJECT_COLORS = ["INK", "ACCENT", "OK", "WARN", "DANGER", "MUTED"] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const PROJECT_COLOR_LABELS: Record<ProjectColor, string> = {
  INK: "Encre",
  ACCENT: "Bleu",
  OK: "Vert",
  WARN: "Jaune",
  DANGER: "Rouge",
  MUTED: "Gris",
};

/** Tailwind class of the project chip's dot (never the only signal: the name is next to it). */
export const PROJECT_COLOR_DOT: Record<ProjectColor, string> = {
  INK: "bg-ink",
  ACCENT: "bg-accent",
  OK: "bg-ok",
  WARN: "bg-warn",
  DANGER: "bg-danger",
  MUTED: "bg-muted",
};

// ---------------------------------------------------------------------------
// Calendar days
// ---------------------------------------------------------------------------

/** `AAAA-MM-JJ` of a `Date` at 00:00 UTC (the shape of `@db.Date`). */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** `AAAA-MM-JJ` + n days. */
export function addDaysIso(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(day: string): number {
  return (new Date(`${day}T00:00:00.000Z`).getUTCDay() + 6) % 7;
}

/** `JJ/MM` of an ISO day (lines of the list). */
export function shortDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

/** `JJ/MM/AAAA` of an ISO day. */
export function longDay(day: string): string {
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
}

function validIso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }
  return isoDay(date);
}

// ---------------------------------------------------------------------------
// Quick add
// ---------------------------------------------------------------------------

const WEEKDAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** Lower case, no accents: « Mélanie » → « melanie ». */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export interface QuickAddParse {
  /** The title, shortcuts removed (may be empty). */
  title: string;
  /** Due day found in the text, or null. */
  dueDate: string | null;
  /** The words that gave the due day (« demain », « 12/11 »), shown before validation. */
  dueText: string | null;
  /** `@names` typed, without the @ (to resolve against the responsibles). */
  mentions: string[];
  /** `#project` typed, without the # (to resolve against the user's projects). */
  projectTag: string | null;
}

/**
 * Reads the quick-add field. Shortcuts, all optional:
 * - « aujourd'hui », « demain », « après-demain », a weekday (« lundi »: the
 *   next one, never today), « 12/11 » (this year, or next year when already
 *   past) or « 12/11/2026 » set the due day — the first one found wins;
 * - « @Prénom » puts the task in that responsible's list (several = shared);
 * - « #projet » files it in a project.
 *
 * @example parseQuickAdd("Appeler la mairie demain @Léa #forum", "2026-11-06")
 * // { title: "Appeler la mairie", dueDate: "2026-11-07", dueText: "demain",
 * //   mentions: ["Léa"], projectTag: "forum" }
 */
export function parseQuickAdd(text: string, today: string): QuickAddParse {
  const mentions: string[] = [];
  let projectTag: string | null = null;
  let dueDate: string | null = null;
  let dueText: string | null = null;

  const words = text.trim().split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < words.length; i += 1) {
    const word = words[i] ?? "";
    if (/^@[\p{L}\p{N}._-]+$/u.test(word)) {
      mentions.push(word.slice(1));
      continue;
    }
    if (/^#[\p{L}\p{N}._-]+$/u.test(word)) {
      projectTag ??= word.slice(1);
      continue;
    }
    if (dueDate === null) {
      const next = words[i + 1];
      const lower = fold(word);
      // « après-demain », also typed « apres demain ».
      if (lower === "apres-demain" || (lower === "apres" && next && fold(next) === "demain")) {
        dueDate = addDaysIso(today, 2);
        dueText = lower === "apres" ? `${word} ${next ?? ""}` : word;
        if (lower === "apres") i += 1;
        continue;
      }
      const relative: Record<string, number> = { "aujourd'hui": 0, aujourdhui: 0, demain: 1 };
      const offset = relative[lower.replace("’", "'")];
      if (offset !== undefined) {
        dueDate = addDaysIso(today, offset);
        dueText = word;
        continue;
      }
      const weekday = WEEKDAYS.indexOf(lower);
      if (weekday >= 0) {
        const delta = (weekday - weekdayIndex(today) + 7) % 7 || 7;
        dueDate = addDaysIso(today, delta);
        dueText = word;
        continue;
      }
      const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(word);
      if (match) {
        const d = Number(match[1]);
        const m = Number(match[2]);
        const year = match[3] ? Number(match[3]) : Number(today.slice(0, 4));
        let iso = validIso(year, m, d);
        if (iso && !match[3] && iso < today) iso = validIso(year + 1, m, d);
        if (iso) {
          dueDate = iso;
          dueText = word;
          continue;
        }
      }
    }
    kept.push(word);
  }
  return { title: kept.join(" ").trim(), dueDate, dueText, mentions, projectTag };
}

/** A responsible a mention can resolve to. */
export interface MentionCandidate {
  id: string;
  name: string;
}

/**
 * Resolves `@names` against the responsibles: the first name (or « prénom.nom »,
 * or the full name without spaces), accents and case ignored. Unknown or
 * ambiguous mentions are returned apart, to be pointed out to the user.
 */
export function resolveMentions(
  mentions: readonly string[],
  candidates: readonly MentionCandidate[],
): { ids: string[]; unknown: string[] } {
  const ids: string[] = [];
  const unknown: string[] = [];
  for (const mention of mentions) {
    const key = fold(mention).replace(/[._-]/g, "");
    const matches = candidates.filter((c) => {
      const parts = fold(c.name).split(/\s+/);
      return parts[0] === key || parts.join("") === key;
    });
    const match = matches.length === 1 ? matches[0] : undefined;
    if (match) {
      if (!ids.includes(match.id)) ids.push(match.id);
    } else unknown.push(mention);
  }
  return { ids, unknown };
}

/** Resolves `#tag` against project names: an exact or prefix match, accents and spaces ignored. */
export function resolveProjectTag<T extends { id: string; name: string }>(
  tag: string | null,
  projects: readonly T[],
): T | null {
  if (!tag) return null;
  const key = fold(tag).replace(/[\s._-]/g, "");
  const squash = (name: string) => fold(name).replace(/[^\p{L}\p{N}]/gu, "");
  const exact = projects.filter((p) => squash(p.name) === key);
  if (exact.length === 1) return exact[0] ?? null;
  const prefix = projects.filter((p) => squash(p.name).startsWith(key));
  return prefix.length === 1 ? (prefix[0] ?? null) : null;
}

// ---------------------------------------------------------------------------
// Groups of « Ma liste »
// ---------------------------------------------------------------------------

export const TODO_GROUPS = ["overdue", "today", "week", "later", "noDate"] as const;
export type TodoGroup = (typeof TODO_GROUPS)[number];

export const TODO_GROUP_LABELS: Record<TodoGroup, string> = {
  overdue: "En retard",
  today: "Aujourd'hui",
  week: "Cette semaine",
  later: "Plus tard",
  noDate: "Sans date",
};

/**
 * The group of an open task: before today → En retard; today; until Sunday
 * of the current week → Cette semaine; after → Plus tard; no date → Sans date.
 */
export function todoGroup(dueDate: string | null, today: string): TodoGroup {
  if (dueDate === null) return "noDate";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "today";
  const sunday = addDaysIso(today, 6 - weekdayIndex(today));
  return dueDate <= sunday ? "week" : "later";
}

/** Splits open tasks into the five groups, keeping the given order inside each group. */
export function groupTodos<T extends { dueDate: string | null }>(
  todos: readonly T[],
  today: string,
): Record<TodoGroup, T[]> {
  const groups: Record<TodoGroup, T[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
    noDate: [],
  };
  for (const todo of todos) groups[todoGroup(todo.dueDate, today)].push(todo);
  return groups;
}

/**
 * Projects must keep at least one active OWNER: true when removing or
 * demoting `userId` would leave none.
 */
export function wouldLeaveNoOwner(
  members: readonly { userId: string; role: "OWNER" | "MEMBER" }[],
  userId: string,
): boolean {
  const owners = members.filter((m) => m.role === "OWNER");
  return owners.length === 1 && owners[0]?.userId === userId;
}

/**
 * New order of a list after moving `id` one step up (-1) or down (+1).
 * Unchanged when the move falls off either end.
 */
export function moveInOrder(ids: readonly string[], id: string, step: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  next.splice(from, 1);
  next.splice(to, 0, id);
  return next;
}
