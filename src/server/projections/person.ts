import type { Prisma } from "@/generated/prisma/client";
import { can } from "../policy/can";
import type { Actor, PersonFacts } from "../policy/types";

/**
 * Typed projections of a person. A view never contains a field the actor is
 * not entitled to: the directory view is the strict subset allowed by
 * `person.directory.read`, the full view adds what `person.full.read` allows.
 * Sensitive data is never part of a projection (see `src/server/sensitive.ts`).
 */

export const DIRECTORY_FIELDS = [
  "id",
  "ref",
  "nivol",
  "firstName",
  "lastName",
  "usageName",
  "status",
  "email",
  "phone",
] as const;

/**
 * The reduced person page of FORMAT (`training.read` without `person.full.read`):
 * the directory fields and the « Formateur » flag, nothing else.
 */
export const REDUCED_FIELDS = [...DIRECTORY_FIELDS, "isTrainer"] as const;

export const FULL_FIELDS = [
  ...DIRECTORY_FIELDS,
  "civility",
  "birthName",
  "proEmail",
  "proPhone",
  "crfEmail",
  "entryDate",
  "leftAt",
  "leftReason",
  "leftComment",
  "isMember",
  "aptitude",
  "aptitudeDate",
  "otherAasc",
  "regularMinorSupervisor",
  "isTrainer",
  "profession",
  "sector",
  "company",
  "notes",
  "archivedAt",
] as const;

/** Prisma `select` loading exactly the fields of the full view. */
export const personFullSelect = Object.fromEntries(FULL_FIELDS.map((f) => [f, true])) as Record<
  (typeof FULL_FIELDS)[number],
  true
> satisfies Prisma.PersonSelect;

export type PersonRow = Prisma.PersonGetPayload<{ select: typeof personFullSelect }>;
export type DirectoryView = Pick<PersonRow, (typeof DIRECTORY_FIELDS)[number]> & {
  view: "directory";
};
export type FullView = PersonRow & { view: "full" };

function pick<K extends keyof PersonRow>(row: PersonRow, keys: readonly K[]): Pick<PersonRow, K> {
  const out = {} as Pick<PersonRow, K>;
  for (const key of keys) out[key] = row[key];
  return out;
}

export function toDirectoryView(row: PersonRow): DirectoryView {
  return { ...pick(row, DIRECTORY_FIELDS), view: "directory" };
}

export type ReducedView = Pick<PersonRow, (typeof REDUCED_FIELDS)[number]> & { view: "reduced" };

/** Prisma `select` of the reduced view. */
export const personReducedSelect = Object.fromEntries(
  REDUCED_FIELDS.map((f) => [f, true]),
) as Record<(typeof REDUCED_FIELDS)[number], true> satisfies Prisma.PersonSelect;

export function toReducedView(row: Pick<PersonRow, (typeof REDUCED_FIELDS)[number]>): ReducedView {
  const out = {} as Pick<PersonRow, (typeof REDUCED_FIELDS)[number]>;
  for (const key of REDUCED_FIELDS) (out as Record<string, unknown>)[key] = row[key];
  return { ...out, view: "reduced" };
}

export function toFullView(row: PersonRow): FullView {
  return { ...pick(row, FULL_FIELDS), view: "full" };
}

/**
 * The widest view `actor` may see of this person, or null when even the
 * directory is refused (a candidate seen by ACTION, an archived person…).
 */
export function projectPerson(
  actor: Pick<Actor, "profiles">,
  facts: PersonFacts,
  row: PersonRow,
): FullView | DirectoryView | null {
  if (can(actor, "person.full.read", { person: facts }).allowed) return toFullView(row);
  if (can(actor, "person.directory.read", { person: facts }).allowed) return toDirectoryView(row);
  return null;
}
