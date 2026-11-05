import type { PersonStatus, TrainingResult } from "@/generated/prisma/enums";
import { formatDate } from "@/lib/dates";
import { NIVOL_PATTERN } from "@/lib/nivol";
import type { AlertTopic } from "../policy/alerts";
import { isValidState, trainingState, type RecordFact, type TrainingState } from "../qualification";
import { b3Due } from "../statusRules";

/**
 * Alert engine, pure part (step 12, docs/alertes.md). An alert is a quality
 * check **computed** on the data of the moment: it disappears as soon as the
 * data is corrected. Nothing is stored.
 */

export type AlertPriority = "HIGH" | "MEDIUM" | "LOW" | "INFO";

export const ALERT_PRIORITIES: readonly AlertPriority[] = ["HIGH", "MEDIUM", "LOW", "INFO"];

export const ALERT_PRIORITY_LABELS: Record<AlertPriority, string> = {
  HIGH: "Haute",
  MEDIUM: "Moyenne",
  LOW: "Basse",
  INFO: "Info",
};

/** Tab of the person page where the alert is corrected. */
export type AlertTab = "apercu" | "integration" | "formations" | "fonctions" | "suivi";

export interface AlertRuleDef {
  priority: AlertPriority;
  topic: AlertTopic;
  label: string;
  tab: AlertTab;
}

export const ALERT_RULES = {
  TRAINING_EXPIRED: {
    priority: "HIGH",
    topic: "training",
    label: "Formation expirée",
    tab: "formations",
  },
  MINOR_FORBIDDEN_FUNCTION: {
    priority: "HIGH",
    topic: "training",
    label: "Mineur nommé à une fonction interdite aux mineurs",
    tab: "fonctions",
  },
  NIVOL_INVALID: {
    priority: "HIGH",
    topic: "admin",
    label: "NIVOL manquant ou invalide",
    tab: "apercu",
  },
  INACTIVE_REFERENCE: {
    priority: "HIGH",
    topic: "training",
    label: "Rattachée à une entrée inactive du référentiel",
    tab: "formations",
  },
  TRAINING_EXPIRING: {
    priority: "MEDIUM",
    topic: "training",
    label: "Formation qui expire bientôt",
    tab: "formations",
  },
  PREREQUISITE_MISSING: {
    priority: "MEDIUM",
    topic: "training",
    label: "Prérequis manquant",
    tab: "formations",
  },
  MINOR_NO_PARENTAL_AUTH: {
    priority: "MEDIUM",
    topic: "integration",
    label: "Mineur sans autorisation parentale",
    tab: "apercu",
  },
  B3_DUE: {
    priority: "MEDIUM",
    topic: "admin",
    label: "B3 à vérifier cette année",
    tab: "suivi",
  },
  CORE_INCOMPLETE: {
    priority: "MEDIUM",
    topic: "training",
    label: "Tronc commun incomplet",
    tab: "formations",
  },
  COMPANION_MISSING: {
    priority: "MEDIUM",
    topic: "training",
    label: "Compétence associée manquante",
    tab: "formations",
  },
  PURGE_DUE: {
    priority: "MEDIUM",
    topic: "admin",
    label: "Fiche à purger",
    tab: "apercu",
  },
  CANDIDACY_FOLLOW_UP_LATE: {
    priority: "MEDIUM",
    topic: "integration",
    label: "Relance de candidat échue",
    tab: "integration",
  },
  FOLLOW_UP_OVERDUE: {
    priority: "MEDIUM",
    topic: "integration",
    label: "Point de suivi en retard",
    tab: "suivi",
  },
  PAUSE_RETURN_PASSED: {
    priority: "MEDIUM",
    topic: "integration",
    label: "Reprise de pause dépassée",
    tab: "apercu",
  },
  RESULT_PENDING: {
    priority: "LOW",
    topic: "training",
    label: "Résultat de session à reporter",
    tab: "formations",
  },
  PROFILE_INCOMPLETE: {
    priority: "LOW",
    topic: "integration",
    label: "Fiche incomplète",
    tab: "apercu",
  },
  REFERENCE_NO_VALIDITY: {
    priority: "INFO",
    topic: "reference",
    label: "Formation sans durée de validité ni règle du 31/12",
    tab: "apercu",
  },
} as const satisfies Record<string, AlertRuleDef>;

export type AlertCode = keyof typeof ALERT_RULES;

export const ALERT_CODES = Object.keys(ALERT_RULES) as AlertCode[];

export function isAlertCode(value: string): value is AlertCode {
  return value in ALERT_RULES;
}

export interface Alert {
  code: AlertCode;
  priority: AlertPriority;
  topic: AlertTopic;
  /** Null for an alert on the reference list. */
  personId: string | null;
  /** « Prénom Nom » or the reference label. */
  subject: string;
  message: string;
  href: string;
}

/** Statuses an alert may concern (« présents »); the purge also looks at those who left. */
export const PRESENT_STATUSES: readonly PersonStatus[] = [
  "CANDIDATE",
  "ACTIVE",
  "PAUSED",
  "SUSPENDED",
];

export interface AlertReference {
  id: string;
  code: string;
  label: string;
  kind: "TRAINING" | "FUNCTION";
  active: boolean;
  forbiddenForMinors: boolean;
  validityMonths: number | null;
  expiresEndOfYear: boolean;
  /** Ids of the prerequisite items. */
  prerequisiteIds: readonly string[];
}

export interface AlertRecord extends RecordFact {
  referenceId: string;
  result: TrainingResult;
}

export interface AlertAppointment {
  referenceId: string;
  startDate: Date | null;
  endDate: Date | null;
}

/** Everything the rules need about one person, loaded in grouped queries (`./load.ts`). */
export interface AlertPerson {
  id: string;
  ref: string;
  firstName: string;
  lastName: string;
  status: PersonStatus;
  nivol: string | null;
  email: string | null;
  regularMinorSupervisor: boolean;
  purgeEligibleAt: Date | null;
  pauseUntil: Date | null;
  /** Derived from the birth date (`sensitive.ts`), null when unknown. */
  age: number | null;
  /** Date of the last B3 check (never the outcome). */
  b3CheckedAt: Date | null;
  parentalAuthorization: boolean;
  /** Not cancelled. */
  records: readonly AlertRecord[];
  /** Not cancelled. */
  appointments: readonly AlertAppointment[];
  /** `followUpAt` of the open candidacy, if any. */
  candidacyFollowUpAt: Date | null;
  /** Planned (not done, not cancelled) follow-up points. */
  plannedFollowUps: readonly Date[];
}

export interface AlertConfig {
  day: Date;
  alertDays: number;
  /** `CORE_TRAINING_CODES` (CRB, TCAU, TCAS). */
  coreCodes: readonly string[];
  /** `REQUIRED_COMPANIONS`: competence code → codes it requires (PSE → OPR, ECG). */
  companions: Readonly<Record<string, readonly string[]>>;
  /** `ALERT_RULES_DISABLED`. */
  disabled: ReadonlySet<AlertCode>;
}

const at = (d: Date) => d.getTime();

function activeOn(a: AlertAppointment, day: Date): boolean {
  return (
    (a.startDate === null || at(a.startDate) <= at(day)) &&
    (a.endDate === null || at(a.endDate) >= at(day))
  );
}

/** One state per reference item the person has records for. */
export function statesOf(
  person: Pick<AlertPerson, "records">,
  day: Date,
  alertDays: number,
): Map<string, TrainingState> {
  const byRef = new Map<string, AlertRecord[]>();
  for (const r of person.records) {
    const list = byRef.get(r.referenceId) ?? [];
    list.push(r);
    byRef.set(r.referenceId, list);
  }
  const states = new Map<string, TrainingState>();
  for (const [id, records] of byRef) states.set(id, trainingState(records, day, alertDays));
  return states;
}

/** Earliest date of a registration (session start or record date) to `referenceId`. */
function registrationDate(person: AlertPerson, referenceId: string, day: Date): Date | null {
  const dates = person.records
    .filter((r) => r.referenceId === referenceId && r.result === "REGISTERED")
    .map((r) => r.sessionStart ?? r.date)
    .filter((d): d is Date => d !== null && at(d) >= at(day))
    .sort((a, b) => at(a) - at(b));
  return dates[0] ?? null;
}

/**
 * Alerts of one person. `references` holds every item of the reference
 * list by id; `byCode` the same by code.
 */
export function personAlerts(
  person: AlertPerson,
  references: ReadonlyMap<string, AlertReference>,
  config: AlertConfig,
): Alert[] {
  const { day } = config;
  const out: Alert[] = [];
  const subject = `${person.firstName} ${person.lastName}`;
  const push = (code: AlertCode, message: string) => {
    if (config.disabled.has(code)) return;
    const rule: AlertRuleDef = ALERT_RULES[code];
    const tab = rule.tab === "apercu" ? "" : `?onglet=${rule.tab}`;
    out.push({
      code,
      priority: rule.priority,
      topic: rule.topic,
      personId: person.id,
      subject,
      message,
      href: `/benevoles/${person.ref}${tab}`,
    });
  };

  if (person.status === "LEFT") {
    if (person.purgeEligibleAt && at(person.purgeEligibleAt) <= at(day)) {
      push(
        "PURGE_DUE",
        `Conservation échue le ${formatDate(person.purgeEligibleAt)} : fiche à purger.`,
      );
    }
    return out;
  }
  if (!PRESENT_STATUSES.includes(person.status)) return out;

  const candidate = person.status === "CANDIDATE";
  const minor = person.age !== null && person.age < 18;
  const states = statesOf(person, day, config.alertDays);
  const byCode = new Map([...references.values()].map((r) => [r.code, r]));
  const valid = (referenceId: string | undefined) => {
    const state = referenceId ? states.get(referenceId) : undefined;
    return state !== undefined && isValidState(state.status);
  };
  const label = (referenceId: string) => references.get(referenceId)?.code ?? "?";

  // -- High --------------------------------------------------------------
  if (!candidate) {
    for (const [referenceId, state] of states) {
      if (state.status === "EXPIRED" && state.expiresAt) {
        push(
          "TRAINING_EXPIRED",
          `${label(referenceId)} : expirée depuis le ${formatDate(state.expiresAt)}.`,
        );
      }
    }
  }
  const activeAppointments = person.appointments.filter((a) => activeOn(a, day));
  if (minor) {
    for (const a of activeAppointments) {
      if (references.get(a.referenceId)?.forbiddenForMinors) {
        push(
          "MINOR_FORBIDDEN_FUNCTION",
          `${label(a.referenceId)} : fonction interdite aux mineurs.`,
        );
      }
    }
  }
  if (!candidate && (person.nivol === null || !NIVOL_PATTERN.test(person.nivol))) {
    push(
      "NIVOL_INVALID",
      person.nivol === null ? "Pas de NIVOL." : `NIVOL invalide : ${person.nivol}.`,
    );
  }
  const inactiveLinks = new Set<string>();
  for (const a of activeAppointments) {
    if (references.get(a.referenceId)?.active === false) inactiveLinks.add(a.referenceId);
  }
  for (const r of person.records) {
    const when = r.sessionStart ?? r.date;
    if (
      r.result === "REGISTERED" &&
      (when === null || at(when) >= at(day)) &&
      references.get(r.referenceId)?.active === false
    ) {
      inactiveLinks.add(r.referenceId);
    }
  }
  for (const referenceId of inactiveLinks) {
    push(
      "INACTIVE_REFERENCE",
      `${label(referenceId)} : inscription ou nomination sur une entrée inactive du référentiel.`,
    );
  }

  // -- Medium ------------------------------------------------------------
  if (!candidate) {
    for (const [referenceId, state] of states) {
      if (state.status === "EXPIRING" && state.expiresAt) {
        push(
          "TRAINING_EXPIRING",
          `${label(referenceId)} : expire le ${formatDate(state.expiresAt)}.`,
        );
      }
    }
    for (const [referenceId, state] of states) {
      if (!isValidState(state.status)) continue;
      for (const prerequisiteId of references.get(referenceId)?.prerequisiteIds ?? []) {
        if (!valid(prerequisiteId)) {
          push(
            "PREREQUISITE_MISSING",
            `${label(referenceId)} valide sans ${label(prerequisiteId)} à jour.`,
          );
        }
      }
    }
  }
  if (minor && !person.parentalAuthorization) {
    push("MINOR_NO_PARENTAL_AUTH", "Mineur sans autorisation parentale enregistrée.");
  }
  if (
    person.regularMinorSupervisor &&
    (person.status === "ACTIVE" || person.status === "PAUSED") &&
    b3Due(person.b3CheckedAt, day)
  ) {
    push(
      "B3_DUE",
      person.b3CheckedAt
        ? `Dernière vérification le ${formatDate(person.b3CheckedAt)}.`
        : "Jamais vérifié.",
    );
  }
  if (person.status === "ACTIVE" || person.status === "PAUSED") {
    const missing = config.coreCodes
      .filter((code) => !valid(byCode.get(code)?.id))
      .map((code) => {
        const ref = byCode.get(code);
        const registered = ref ? registrationDate(person, ref.id, day) : null;
        return registered ? `${code} (inscrit(e) le ${formatDate(registered)})` : code;
      });
    if (missing.length > 0) push("CORE_INCOMPLETE", `Manque : ${missing.join(", ")}.`);
  }
  if (!candidate) {
    for (const [code, required] of Object.entries(config.companions)) {
      if (!valid(byCode.get(code)?.id)) continue;
      const lacking = required.filter((c) => !valid(byCode.get(c)?.id));
      if (lacking.length > 0) push("COMPANION_MISSING", `${code} sans ${lacking.join(" ni ")}.`);
    }
  }
  if (person.candidacyFollowUpAt && at(person.candidacyFollowUpAt) < at(day)) {
    push(
      "CANDIDACY_FOLLOW_UP_LATE",
      `Relance prévue le ${formatDate(person.candidacyFollowUpAt)}.`,
    );
  }
  if (person.status === "ACTIVE" || person.status === "PAUSED") {
    const late = person.plannedFollowUps
      .filter((d) => at(d) < at(day))
      .sort((a, b) => at(a) - at(b));
    if (late[0]) push("FOLLOW_UP_OVERDUE", `Point prévu le ${formatDate(late[0])}.`);
  }
  if (person.status === "PAUSED" && person.pauseUntil && at(person.pauseUntil) < at(day)) {
    push("PAUSE_RETURN_PASSED", `Reprise prévue le ${formatDate(person.pauseUntil)}.`);
  }

  // -- Low ---------------------------------------------------------------
  for (const [referenceId, state] of states) {
    if (state.pendingResult)
      push("RESULT_PENDING", `${label(referenceId)} : session passée, résultat à saisir.`);
  }
  const lacking: string[] = [];
  if (!person.email) lacking.push("e-mail");
  if (person.age === null) lacking.push("date de naissance");
  if (person.records.some((r) => r.result === "PASSED" && r.date === null)) {
    lacking.push("dates d'obtention");
  }
  if (lacking.length > 0) push("PROFILE_INCOMPLETE", `Manque : ${lacking.join(", ")}.`);

  return out;
}

/** INFO alerts on the reference list itself. */
export function referenceAlerts(
  references: Iterable<AlertReference>,
  config: Pick<AlertConfig, "disabled">,
): Alert[] {
  if (config.disabled.has("REFERENCE_NO_VALIDITY")) return [];
  const rule = ALERT_RULES.REFERENCE_NO_VALIDITY;
  return [...references]
    .filter(
      (r) => r.active && r.kind === "TRAINING" && r.validityMonths === null && !r.expiresEndOfYear,
    )
    .map((r) => ({
      code: "REFERENCE_NO_VALIDITY" as const,
      priority: rule.priority,
      topic: rule.topic,
      personId: null,
      subject: `${r.code} : ${r.label}`,
      message: "Ni durée de validité ni règle du 31/12 : l'échéance n'est jamais calculée.",
      href: "/formations/referentiel",
    }));
}

/** Sort: priority first, then subject. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  const rank = (p: AlertPriority) => ALERT_PRIORITIES.indexOf(p);
  return alerts.sort(
    (a, b) =>
      rank(a.priority) - rank(b.priority) ||
      a.subject.localeCompare(b.subject, "fr") ||
      a.code.localeCompare(b.code),
  );
}
