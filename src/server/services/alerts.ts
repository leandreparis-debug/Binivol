import { toParisDay } from "@/lib/dates";
import { alertCounts, alertsFor, canSeeAlerts, type LoadedAlert } from "../alerts/load";
import { ALERT_PRIORITIES, isAlertCode, type AlertCode, type AlertPriority } from "../alerts/rules";
import type { DbOrTx } from "../db";
import type { Actor } from "../policy/types";

/** Filters of /alertes (query string). */
export interface AlertFilters {
  priority: AlertPriority | null;
  code: AlertCode | null;
  /** « moi »: people whose latest candidacy is owned by the actor. */
  mine: boolean;
  /** A person's ref (link from the person page). */
  personRef: string | null;
}

export function parseAlertFilters(raw: Record<string, string | undefined>): AlertFilters {
  const priority = (ALERT_PRIORITIES as readonly string[]).includes(raw.priorite ?? "")
    ? (raw.priorite as AlertPriority)
    : null;
  const code = raw.regle && isAlertCode(raw.regle) ? raw.regle : null;
  const personRef = /^P-\d{5,}$/.test(raw.personne ?? "") ? (raw.personne ?? null) : null;
  return { priority, code, mine: raw.responsable === "moi", personRef };
}

/** Alerts of /alertes, filtered; `null` when the actor may see no alert at all. */
export async function alertsPage(
  db: DbOrTx,
  actor: Actor,
  filters: AlertFilters,
  day: Date = toParisDay(),
): Promise<{ alerts: LoadedAlert[]; total: number; personName: string | null } | null> {
  if (!canSeeAlerts(actor)) return null;
  let personIds: string[] | undefined;
  let personName: string | null = null;
  if (filters.personRef) {
    const person = await db.person.findUnique({
      where: { ref: filters.personRef },
      select: { id: true, firstName: true, lastName: true },
    });
    personIds = person ? [person.id] : [];
    personName = person ? `${person.firstName} ${person.lastName}` : null;
  }
  const all = await alertsFor(db, actor, { day, ...(personIds ? { personIds } : {}) });
  const alerts = all.filter(
    (a) =>
      (filters.priority === null || a.priority === filters.priority) &&
      (filters.code === null || a.code === filters.code) &&
      (!filters.mine || a.ownerId === actor.userId),
  );
  return { alerts, total: all.length, personName };
}

/** Number of visible alerts per person (directory badge, person header). */
export function alertCountsFor(
  db: DbOrTx,
  actor: Actor,
  personIds: readonly string[],
): Promise<Map<string, number>> {
  return alertCounts(db, actor, personIds);
}

export { alertsFor, canSeeAlerts };
