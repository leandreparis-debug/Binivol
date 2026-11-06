import type { PersonStatus, Profile } from "@/generated/prisma/enums";
import { formatDate, toParisDay } from "@/lib/dates";
import { CANDIDACY_STAGE_LABELS, FOLLOW_UP_KIND_LABELS, PERSON_STATUS_LABELS } from "@/lib/labels";
import { alertsFor, loadAlertPeople, loadAlertReferences } from "../alerts/load";
import { ALERT_RULES, statesOf } from "../alerts/rules";
import { automationSettings } from "../automationSettings";
import { OPEN_STAGES } from "../candidacy/machine";
import {
  monthlyFlows,
  recruitmentFunnel,
  retentionCohorts,
  type Cohort,
  type FunnelStep,
} from "../dashboard/aggregates";
import type { DbOrTx } from "../db";
import { countDossiersToCountersign } from "../dossier/store";
import { canSome } from "../policy/can";
import type { Actor } from "../policy/types";
import { visibleSql, type VisibilityContext } from "../policy/visibility";
import { isValidState, type TrainingState } from "../qualification";
import { addMonthsUtc } from "../reference";
import { b3ToCheck } from "../sensitive";
import { numericSettings } from "../settings";
import { PROFILE_ORDER } from "./accounts";
import { overdueCandidacies } from "./candidacies";
import { followUpBoard } from "./followUps";

/**
 * Home page by profile (step 13, docs/tableaux-de-bord.md). One block per
 * profile of the user, in a stable order. Each block counts **only what that
 * profile sees**: every query is filtered by `visibleSql()` for an actor
 * holding that single profile, before counting.
 */

export interface DashboardStat {
  label: string;
  value: number;
  hint?: string;
  href?: string;
}

export interface DashboardTodo {
  label: string;
  detail: string;
  href: string;
}

export interface DashboardBars {
  title: string;
  primaryLabel: string;
  secondaryLabel?: string;
  data: { label: string; primary: number; secondary?: number }[];
}

export interface DashboardBlock {
  profile: Profile;
  title: string;
  stats: DashboardStat[];
  todoTitle: string;
  todo: DashboardTodo[];
  todoHref: string;
  charts: DashboardBars[];
  funnel?: FunnelStep[];
  cohorts?: Cohort[];
}

const BLOCK_TITLES: Record<Profile, string> = {
  TOPAZE: "Unité locale",
  DIAMANT: "Recrutement et intégration",
  ACTION: "Missions de secours",
  LASER: "Urgence",
  FORMAT: "Formation interne",
  FORMAT_GP: "Formation grand public",
};

const PRESENT: PersonStatus[] = ["CANDIDATE", "ACTIVE", "PAUSED", "SUSPENDED"];
const name = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

/** The same actor reduced to one profile: a block counts what this profile sees. */
function only(actor: Actor, profile: Profile): Actor {
  return { ...actor, profiles: new Set([profile]) };
}

async function visibleIds(
  db: DbOrTx,
  actor: Actor,
  action: Parameters<typeof visibleSql>[1],
  ctx: VisibilityContext,
  statuses: readonly PersonStatus[],
): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT p.id FROM persons p
    WHERE ${visibleSql(actor, action, ctx)} AND p.archived_at IS NULL
      AND p.status::text = ANY(${[...statuses]}::text[])`;
  return rows.map((r) => r.id);
}

/** Training states of visible people, by person and code. */
async function statesByCode(db: DbOrTx, ids: string[], day: Date, alertDays: number) {
  const references = await loadAlertReferences(db);
  const { people } = await loadAlertPeople(db, ids, day);
  return people.map((p) => {
    const byCode = new Map<string, TrainingState>();
    for (const [id, state] of statesOf(p, day, alertDays)) {
      const code = references.get(id)?.code;
      if (code) byCode.set(code, state);
    }
    return { person: p, byCode };
  });
}

async function cohortsOf(db: DbOrTx, ids: string[], day: Date) {
  const rows = await db.person.findMany({
    where: { id: { in: ids } },
    select: { entryDate: true, leftAt: true },
  });
  return { cohorts: retentionCohorts(rows, day), flows: monthlyFlows(rows, day) };
}

async function topazeBlock(
  db: DbOrTx,
  actor: Actor,
  ctx: VisibilityContext,
): Promise<DashboardBlock> {
  const { day } = ctx;
  const all = await visibleIds(db, actor, "person.full.read", ctx, [
    ...PRESENT,
    "INACTIVE",
    "LEFT",
  ]);
  const [statusRows, alerts, b3, purge, history] = await Promise.all([
    db.person.groupBy({
      by: ["status"],
      where: { id: { in: all } },
      _count: { _all: true },
    }),
    alertsFor(db, actor, { day }),
    b3ToCheck(db, actor, day),
    db.person.count({ where: { id: { in: all }, status: "LEFT", purgeEligibleAt: { lte: day } } }),
    cohortsOf(db, all, day),
  ]);
  const byStatus = new Map(statusRows.map((r) => [r.status, r._count._all]));
  const high = alerts.filter((a) => a.priority === "HIGH");
  return {
    profile: "TOPAZE",
    title: BLOCK_TITLES.TOPAZE,
    stats: [
      {
        label: "Bénévoles actifs",
        value: byStatus.get("ACTIVE") ?? 0,
        href: "/benevoles?statut=ACTIVE",
      },
      { label: "Alertes hautes", value: high.length, href: "/alertes?priorite=HIGH" },
      { label: "B3 à vérifier", value: b3.length, href: "/candidats/suivi" },
      { label: "Fiches à purger", value: purge, href: "/alertes?regle=PURGE_DUE" },
    ],
    todoTitle: "Alertes hautes",
    todo: high.slice(0, 5).map((a) => ({
      label: a.subject,
      detail: `${ALERT_RULES[a.code].label} · ${a.message}`,
      href: a.href,
    })),
    todoHref: "/alertes?priorite=HIGH",
    charts: [
      {
        title: "Effectif par statut",
        primaryLabel: "personnes",
        data: (["CANDIDATE", "ACTIVE", "PAUSED", "SUSPENDED", "INACTIVE", "LEFT"] as const).map(
          (s) => ({ label: PERSON_STATUS_LABELS[s], primary: byStatus.get(s) ?? 0 }),
        ),
      },
      {
        title: "Arrivées et départs sur 12 mois",
        primaryLabel: "arrivées",
        secondaryLabel: "départs",
        data: history.flows.map((f) => ({
          label: f.label,
          primary: f.arrivals,
          secondary: f.departures,
        })),
      },
    ],
    cohorts: history.cohorts,
  };
}

async function diamantBlock(
  db: DbOrTx,
  actor: Actor,
  ctx: VisibilityContext,
): Promise<DashboardBlock> {
  const { day } = ctx;
  const scope = await visibleIds(db, actor, "candidacy.manage", ctx, [
    ...PRESENT,
    "LEFT",
    "INACTIVE",
  ]);
  const since = addMonthsUtc(day, -12);
  const [candidacies, overdue, toCountersign, board, newcomers, history] = await Promise.all([
    db.candidacy.findMany({
      where: { personId: { in: scope } },
      select: {
        stage: true,
        createdAt: true,
        closedAt: true,
        events: { select: { at: true, toStage: true } },
      },
    }),
    overdueCandidacies(db, actor, day),
    countDossiersToCountersign(db, scope),
    followUpBoard(db, actor, { owner: "all" }, day),
    db.person.count({
      where: { id: { in: scope }, status: "ACTIVE", entryDate: { gt: since } },
    }),
    cohortsOf(db, scope, day),
  ]);
  const funnel = recruitmentFunnel(candidacies, OPEN_STAGES, day);
  const upcoming = board.filter((f) => f.bucket !== "overdue");
  return {
    profile: "DIAMANT",
    title: BLOCK_TITLES.DIAMANT,
    stats: [
      { label: "Relances échues", value: overdue, href: "/candidats?relance=1" },
      { label: "Dossiers à contresigner", value: toCountersign, href: "/candidats" },
      {
        label: "Points de suivi à venir",
        value: upcoming.length,
        hint: "sous 31 jours",
        href: "/candidats/suivi",
      },
      {
        label: "Nouveaux bénévoles",
        value: newcomers,
        hint: "moins de 12 mois",
        href: "/benevoles",
      },
    ],
    todoTitle: "Points de suivi",
    todo: board.slice(0, 5).map((f) => ({
      label: `${f.firstName} ${f.lastName}`,
      detail: `${FOLLOW_UP_KIND_LABELS[f.kind]} · ${f.bucket === "overdue" ? "en retard, " : ""}prévu le ${formatDate(f.scheduledAt)}`,
      href: `/benevoles/${f.ref}?onglet=suivi`,
    })),
    todoHref: "/candidats/suivi",
    charts: [
      {
        title: "Entonnoir de recrutement",
        primaryLabel: "candidats",
        data: funnel.map((s) => ({ label: CANDIDACY_STAGE_LABELS[s.stage], primary: s.count })),
      },
    ],
    funnel,
    cohorts: history.cohorts,
  };
}

async function trainingBlock(
  db: DbOrTx,
  actor: Actor,
  profile: "ACTION" | "LASER" | "FORMAT_GP",
  ctx: VisibilityContext,
  alertDays: number,
): Promise<DashboardBlock> {
  const { day } = ctx;
  const ids = await visibleIds(db, actor, "training.read", ctx, ["ACTIVE", "PAUSED"]);
  const states = await statesByCode(db, ids, day, alertDays);
  const settings = await automationSettings(db);
  const count = (code: string, ok: (s: TrainingState) => boolean) =>
    states.filter((p) => {
      const s = p.byCode.get(code);
      return s !== undefined && ok(s);
    }).length;
  const valid = (code: string) => count(code, (s) => isValidState(s.status));
  const expiring = (codes: string[]) =>
    states.flatMap((p) =>
      codes.flatMap((code) => {
        const s = p.byCode.get(code);
        return s?.status === "EXPIRING" && s.expiresAt
          ? [{ person: p.person, code, expiresAt: s.expiresAt }]
          : [];
      }),
    );
  const todoOf = (list: ReturnType<typeof expiring>) =>
    list
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime())
      .slice(0, 5)
      .map((e) => ({
        label: name(e.person),
        detail: `${e.code} expire le ${formatDate(e.expiresAt)}`,
        href: `/benevoles/${e.person.ref}?onglet=formations`,
      }));

  if (profile === "ACTION") {
    const soon = expiring(["PSE"]);
    const coreMissing = states.filter((p) =>
      settings.coreTrainingCodes.some((c) => {
        const s = p.byCode.get(c);
        return !s || !isValidState(s.status);
      }),
    ).length;
    return {
      profile,
      title: BLOCK_TITLES.ACTION,
      stats: [
        { label: "PSE valides", value: valid("PSE"), href: "/formations/trouver?c1=PSE" },
        { label: "PSE qui expirent", value: soon.length, hint: `sous ${String(alertDays)} jours` },
        {
          label: "Tronc commun incomplet",
          value: coreMissing,
          href: "/alertes?regle=CORE_INCOMPLETE",
        },
        {
          label: "Équipiers disponibles",
          value: states.filter((p) => p.person.status === "ACTIVE").length,
          hint: "présents, hors pause et suspendus",
        },
      ],
      todoTitle: "Échéances PSE",
      todo: todoOf(soon),
      todoHref: "/alertes?regle=TRAINING_EXPIRING",
      charts: [],
    };
  }
  if (profile === "LASER") {
    const appointed = await db.appointment.count({
      where: {
        personId: { in: ids },
        cancelledAt: null,
        reference: { code: { in: ["CI", "CI_SDIS"] } },
        OR: [{ startDate: null }, { startDate: { lte: day } }],
        AND: [{ OR: [{ endDate: null }, { endDate: { gte: day } }] }],
      },
    });
    const laserCodes = (
      await db.referenceItem.findMany({
        where: { perimeters: { has: "LASER" }, kind: "TRAINING" },
        select: { code: true },
      })
    ).map((r) => r.code);
    const soon = expiring(laserCodes);
    return {
      profile,
      title: BLOCK_TITLES.LASER,
      stats: [
        { label: "TCAU valides", value: valid("TCAU"), href: "/formations/trouver?c1=TCAU" },
        { label: "CI et CI SDIS nommés", value: appointed },
        {
          label: "Expirations à venir",
          value: soon.length,
          hint: `sous ${String(alertDays)} jours`,
        },
      ],
      todoTitle: "Expirations à venir",
      todo: todoOf(soon),
      todoHref: "/alertes?regle=TRAINING_EXPIRING",
      charts: [],
    };
  }
  // FORMAT GP: trainers and assistants; FCPSE / FCCI to do before 31/12.
  const recycling = states.flatMap((p) =>
    ["FCPSE", "FCCI"].flatMap((code) => {
      const s = p.byCode.get(code);
      return s && (s.status === "EXPIRING" || s.status === "EXPIRED")
        ? [{ person: p.person, code, expiresAt: s.expiresAt }]
        : [];
    }),
  );
  return {
    profile,
    title: BLOCK_TITLES.FORMAT_GP,
    stats: [
      {
        label: "Formateurs et assistants actifs",
        value: states.filter((p) => p.person.status === "ACTIVE").length,
      },
      { label: "Recyclages à faire", value: recycling.length, hint: "FCPSE, FCCI avant le 31/12" },
    ],
    todoTitle: "Recyclages FCPSE / FCCI",
    todo: recycling.slice(0, 5).map((r) => ({
      label: name(r.person),
      detail: `${r.code} ${r.expiresAt ? `échue le ${formatDate(r.expiresAt)}` : "à refaire"}`,
      href: `/benevoles/${r.person.ref}?onglet=formations`,
    })),
    todoHref: "/formations/trouver",
    charts: [],
  };
}

async function formatBlock(
  db: DbOrTx,
  actor: Actor,
  ctx: VisibilityContext,
  alertDays: number,
): Promise<DashboardBlock> {
  const { day } = ctx;
  const ids = await visibleIds(db, actor, "training.read", ctx, ["ACTIVE", "PAUSED", "SUSPENDED"]);
  const [sessions, states, wishes] = await Promise.all([
    db.trainingSession.findMany({
      where: { cancelledAt: null, startDate: { gte: day } },
      orderBy: { startDate: "asc" },
      select: { id: true, startDate: true, reference: { select: { code: true } } },
    }),
    statesByCode(db, ids, day, alertDays),
    db.trainingWish.groupBy({
      by: ["referenceId"],
      where: { personId: { in: ids }, status: { in: ["OPEN", "WAITLISTED"] } },
      _count: { _all: true },
    }),
  ]);
  const pending = states.reduce(
    (n, p) => n + [...p.byCode.values()].filter((s) => s.pendingResult).length,
    0,
  );
  const references = await loadAlertReferences(db);
  const waiting = wishes
    .map((w) => ({ code: references.get(w.referenceId)?.code ?? "?", count: w._count._all }))
    .sort((a, b) => b.count - a.count);
  return {
    profile: "FORMAT",
    title: BLOCK_TITLES.FORMAT,
    stats: [
      { label: "Sessions à venir", value: sessions.length, href: "/formations/sessions" },
      { label: "Résultats à reporter", value: pending, href: "/alertes?regle=RESULT_PENDING" },
      {
        label: "En liste d'attente",
        value: waiting.reduce((n, w) => n + w.count, 0),
        href: "/formations/attente",
      },
    ],
    todoTitle: "Prochaines sessions",
    todo: sessions.slice(0, 5).map((s) => ({
      label: s.reference.code,
      detail: `le ${formatDate(s.startDate)}`,
      href: `/formations/sessions/${s.id}`,
    })),
    todoHref: "/formations/sessions",
    charts: [
      {
        title: "Listes d'attente par formation",
        primaryLabel: "personnes",
        data: waiting.slice(0, 8).map((w) => ({ label: w.code, primary: w.count })),
      },
    ],
  };
}

/** The blocks of every profile of the actor, in the stable order of the profiles. */
export async function dashboardFor(
  db: DbOrTx,
  actor: Actor,
  day: Date = toParisDay(),
): Promise<DashboardBlock[]> {
  const numeric = await numericSettings(db);
  const ctx: VisibilityContext = { day, newVolunteerMonths: numeric.newVolunteerMonths };
  const blocks: DashboardBlock[] = [];
  for (const profile of PROFILE_ORDER) {
    if (!actor.profiles.has(profile)) continue;
    const one = only(actor, profile);
    switch (profile) {
      case "TOPAZE":
        blocks.push(await topazeBlock(db, one, ctx));
        break;
      case "DIAMANT":
        if (canSome(one, "candidacy.manage")) blocks.push(await diamantBlock(db, one, ctx));
        break;
      case "FORMAT":
        blocks.push(await formatBlock(db, one, ctx, numeric.alertDays));
        break;
      default:
        blocks.push(await trainingBlock(db, one, profile, ctx, numeric.alertDays));
    }
  }
  return blocks;
}
