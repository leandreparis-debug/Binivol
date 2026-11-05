import { Prisma } from "@/generated/prisma/client";
import type { Perimeter, Profile } from "@/generated/prisma/enums";
import type { PolicyAction } from "@/lib/actions";
import { addMonthsUtc } from "../reference";
import { MATRIX, PROFILE_PERIMETER, type ActionRule, type Condition } from "./matrix";
import type { Actor } from "./types";

/**
 * The access matrix translated into SQL, so that lists filter **in the
 * database, before pagination and counting** instead of loading everyone and
 * filtering in memory.
 *
 * Every function here mirrors a rule of `can()` (`./can.ts`) for the people
 * table aliased `p`. They are tested against `can()` on the seed, account by
 * account (`__tests__/visibility.db.test.ts`): a person is returned by the SQL
 * if and only if `can()` allows the action on her. Change both together.
 */

/** Context the SQL needs: the reference day and the DIAMANT newcomer window. */
export interface VisibilityContext {
  /** Reference day, 00:00 UTC (today in Paris by default at the call site). */
  day: Date;
  /** `NEW_VOLUNTEER_MONTHS` setting. */
  newVolunteerMonths: number;
}

const TRUE = Prisma.sql`TRUE`;
const FALSE = Prisma.sql`FALSE`;
const NOT_ARCHIVED = Prisma.sql`p.archived_at IS NULL`;
const NOT_CANDIDATE = Prisma.sql`p.status <> 'CANDIDATE'::"PersonStatus"`;

/**
 * The person holds `perimeter` on `day` (mirror of `computePerimeters`):
 * an effective training (PASSED, not cancelled, not expired), an active
 * appointment (not cancelled, started or without start date, not ended),
 * or the trainer flag for FORMAT_GP.
 */
export function perimeterSql(perimeter: Perimeter, day: Date): Prisma.Sql {
  const trainer = perimeter === "FORMAT_GP" ? Prisma.sql`p.is_trainer IS TRUE OR` : Prisma.empty;
  return Prisma.sql`(${trainer}
    EXISTS (
      SELECT 1 FROM training_records tr
      JOIN reference_items ri ON ri.id = tr.reference_id
      WHERE tr.person_id = p.id
        AND tr.result = 'PASSED'::"TrainingResult"
        AND tr.cancelled_at IS NULL
        AND (tr.expires_at IS NULL OR tr.expires_at >= ${day}::date)
        AND ${perimeter}::"Perimeter" = ANY(ri.perimeters)
    )
    OR EXISTS (
      SELECT 1 FROM appointments a
      JOIN reference_items ri ON ri.id = a.reference_id
      WHERE a.person_id = p.id
        AND a.cancelled_at IS NULL
        AND (a.start_date IS NULL OR a.start_date <= ${day}::date)
        AND (a.end_date IS NULL OR a.end_date >= ${day}::date)
        AND ${perimeter}::"Perimeter" = ANY(ri.perimeters)
    ))`;
}

/**
 * The person is in the DIAMANT scope (mirror of `loadPersonFacts`):
 * candidate, open candidacy, entered less than NEW_VOLUNTEER_MONTHS ago, or
 * current mentee.
 */
export function diamantScopeSql(ctx: VisibilityContext): Prisma.Sql {
  const since = addMonthsUtc(ctx.day, -ctx.newVolunteerMonths);
  return Prisma.sql`(
    p.status = 'CANDIDATE'::"PersonStatus"
    OR EXISTS (SELECT 1 FROM candidacies c WHERE c.person_id = p.id AND c.closed_at IS NULL)
    OR (p.entry_date IS NOT NULL AND p.entry_date > ${since}::date)
    OR EXISTS (
      SELECT 1 FROM mentorships m
      WHERE m.mentee_id = p.id
        AND m.start_date <= ${ctx.day}::date
        AND (m.end_date IS NULL OR m.end_date >= ${ctx.day}::date)
    ))`;
}

/** Mirror of `relevesOf(person, profile)`. */
export function relevesOfSql(profile: Profile, ctx: VisibilityContext): Prisma.Sql {
  if (profile === "DIAMANT") return Prisma.sql`(${NOT_ARCHIVED} AND ${diamantScopeSql(ctx)})`;
  const perimeter = PROFILE_PERIMETER[profile];
  if (!perimeter) return FALSE;
  return Prisma.sql`(${NOT_ARCHIVED} AND ${NOT_CANDIDATE} AND ${perimeterSql(perimeter, ctx.day)})`;
}

function conditionSql(condition: Condition, profile: Profile, ctx: VisibilityContext): Prisma.Sql {
  switch (condition) {
    case "always":
      return TRUE;
    case "notArchived":
      return NOT_ARCHIVED;
    case "notArchivedNotCandidate":
      return Prisma.sql`(${NOT_ARCHIVED} AND ${NOT_CANDIDATE})`;
    case "inScope":
      return relevesOfSql(profile, ctx);
    case "managedFunctionInScope":
      // Needs a function: never true for a person alone.
      return FALSE;
  }
}

/**
 * SQL condition on `persons p` that is true exactly for the people on whom
 * `can(actor, action, { person })` is allowed. Profiles add up (OR); a grant
 * with condition `always` short-circuits to TRUE.
 *
 * @throws {Error} for an action that does not target a person.
 * @example
 * const where = visibleSql(actor, "person.directory.read", ctx);
 * await db.$queryRaw`SELECT p.id FROM persons p WHERE ${where}`;
 */
export function visibleSql(
  actor: Pick<Actor, "profiles">,
  action: PolicyAction,
  ctx: VisibilityContext,
): Prisma.Sql {
  const rule: ActionRule = MATRIX[action];
  if (rule.target !== "person") throw new Error(`${action} ne porte pas sur une personne.`);
  const parts: Prisma.Sql[] = [];
  for (const grant of rule.grants) {
    for (const profile of grant.profiles) {
      if (!actor.profiles.has(profile)) continue;
      if (grant.when === "always") return TRUE;
      parts.push(conditionSql(grant.when, profile, ctx));
    }
  }
  return parts.length === 0 ? FALSE : Prisma.sql`(${Prisma.join(parts, " OR ")})`;
}

/** Mirror of `personPageAccess() !== null`: the person page opens (full or reduced). */
export function personPageSql(actor: Pick<Actor, "profiles">, ctx: VisibilityContext): Prisma.Sql {
  return Prisma.sql`(${visibleSql(actor, "person.full.read", ctx)} OR ${visibleSql(actor, "training.read", ctx)})`;
}

/** The directory rule (`person.directory.read`), the one lists must apply. */
export function directoryVisibilitySql(
  actor: Pick<Actor, "profiles">,
  ctx: VisibilityContext,
): Prisma.Sql {
  return visibleSql(actor, "person.directory.read", ctx);
}
