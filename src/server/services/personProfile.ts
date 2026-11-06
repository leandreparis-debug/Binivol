import type {
  FollowUpKind,
  LanguageLevel,
  Perimeter,
  ReferenceCategory,
  SkillLevel,
  TrainingResult,
  TrainingWishStatus,
} from "@/generated/prisma/enums";
import { classifyDeadline, type DeadlineClass } from "@/lib/deadlines";
import { toParisDay } from "@/lib/dates";
import type { DbOrTx } from "../db";
import { isAppointmentActive } from "../perimeter";
import { authorize, can, personPageAccess } from "../policy/can";
import { loadPersonFacts } from "../policy/facts";
import type { Actor, PersonFacts } from "../policy/types";
import {
  personFullSelect,
  personReducedSelect,
  toFullView,
  toReducedView,
  type FullView,
  type ReducedView,
} from "../projections/person";
import { agesOf } from "../sensitive";
import { numericSettings } from "../settings";
import { deadlineCounts, qualificationsOf, type QualificationState } from "../trainingSummary";

/**
 * Read side of the person page (`/benevoles/[ref]`). Every function checks
 * the policy itself and returns projected, serialisable views — never a raw
 * Prisma row, never a sensitive field (those go through `sensitive.ts`).
 */

export type PersonLookup =
  | { status: "notFound" }
  | { status: "forbidden"; reason: string }
  | { status: "ok"; personId: string; facts: PersonFacts; access: "full" | "trainings" };

/**
 * Finds a person by readable number for the person page:
 * - unknown ref, **or a person the actor may not even see in the directory**
 *   (a candidate for ACTION, an archived person…) → `notFound`, so the page
 *   never reveals that she exists;
 * - visible in the directory but neither `person.full.read` nor `training.read`
 *   → `forbidden`;
 * - `access` says whether the page is full or reduced to the trainings (FORMAT).
 */
export async function lookupPerson(db: DbOrTx, actor: Actor, ref: string): Promise<PersonLookup> {
  const normalized = ref.trim().toUpperCase();
  if (!/^P-\d{5,}$/.test(normalized)) return { status: "notFound" };
  const row = await db.person.findUnique({ where: { ref: normalized }, select: { id: true } });
  if (!row) return { status: "notFound" };
  const facts = await loadPersonFacts(db, row.id);
  if (!facts) return { status: "notFound" };
  if (!can(actor, "person.directory.read", { person: facts }).allowed)
    return { status: "notFound" };
  const access = personPageAccess(actor, facts);
  if (!access) {
    return {
      status: "forbidden",
      reason: can(actor, "person.full.read", { person: facts }).reason,
    };
  }
  return { status: "ok", personId: row.id, facts, access };
}

/** What the actor may do on this person (buttons, tabs). From `can()` only. */
export interface PersonPermissions {
  update: boolean;
  changeStatus: boolean;
  /** « Retour d'un ancien » (LEFT → ACTIVE), TOPAZE and DIAMANT. */
  returnFormer: boolean;
  correctNivol: boolean;
  /** Export of all the data (GDPR, TOPAZE). */
  gdprExport: boolean;
  readSensitive: boolean;
  readTrainings: boolean;
  readAppointments: boolean;
  readFollowUp: boolean;
  readDocuments: boolean;
  uploadDocuments: boolean;
  readArchivedDocuments: boolean;
  readCandidacy: boolean;
  readMentorships: boolean;
}

export function permissionsOn(actor: Actor, facts: PersonFacts): PersonPermissions {
  const on = (action: Parameters<typeof can>[1]) => can(actor, action, { person: facts }).allowed;
  return {
    update: on("person.update"),
    changeStatus: on("person.status.change"),
    returnFormer: on("person.return"),
    correctNivol: on("person.nivol.correct"),
    gdprExport: on("person.gdprExport"),
    readSensitive: on("person.sensitive.read"),
    readTrainings: on("training.read"),
    readAppointments: on("appointment.read"),
    // « Suivi » tab: follow-ups and mentorships (TOPAZE holds followUp.manage).
    readFollowUp: on("followUp.manage"),
    readDocuments: on("document.read"),
    uploadDocuments: on("document.upload"),
    readArchivedDocuments: on("document.archived.read"),
    readCandidacy: on("candidacy.manage"),
    readMentorships: on("mentorship.manage"),
  };
}

export interface PersonHeader {
  person: FullView;
  legacyImport: boolean;
  age: number | null;
  minor: boolean;
  perimeters: Perimeter[];
  permissions: PersonPermissions;
  alertDays: number;
}

/** Header of the person page: full view, age, perimeters, permissions. */
export async function personHeader(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
  day: Date = toParisDay(),
): Promise<PersonHeader> {
  authorize(actor, "person.full.read", { person: facts });
  const [row, ages, settings] = await Promise.all([
    db.person.findUniqueOrThrow({
      where: { id: personId },
      select: { ...personFullSelect, legacyImport: true },
    }),
    agesOf(db, [personId], day),
    numericSettings(db),
  ]);
  const age = ages.get(personId) ?? null;
  const order: Perimeter[] = ["ACTION", "LASER", "FORMAT_GP"];
  return {
    person: toFullView(row),
    legacyImport: row.legacyImport,
    age,
    minor: age !== null && age < 18,
    perimeters: order.filter((p) => facts.perimeters.has(p)),
    permissions: permissionsOn(actor, facts),
    alertDays: settings.alertDays,
  };
}

export interface ReducedHeader {
  person: ReducedView;
  perimeters: Perimeter[];
  alertDays: number;
}

/**
 * Header of the reduced page (`training.read` only, FORMAT): the directory
 * fields, the perimeters and the trainer flag. No age, no entry date, no action.
 */
export async function personReducedHeader(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
): Promise<ReducedHeader> {
  authorize(actor, "training.read", { person: facts });
  const [row, settings] = await Promise.all([
    db.person.findUniqueOrThrow({ where: { id: personId }, select: personReducedSelect }),
    numericSettings(db),
  ]);
  const order: Perimeter[] = ["ACTION", "LASER", "FORMAT_GP"];
  return {
    person: toReducedView(row),
    perimeters: order.filter((p) => facts.perimeters.has(p)),
    alertDays: settings.alertDays,
  };
}

// ---------------------------------------------------------------------------
// Aperçu
// ---------------------------------------------------------------------------

export interface PersonOverview {
  skills: { id: string; label: string; level: SkillLevel }[];
  languages: { id: string; label: string; level: LanguageLevel }[];
  licenses: { id: string; category: string }[];
  annexes: {
    id: string;
    code: string;
    label: string | null;
    validUntil: Date | null;
    deadline: DeadlineClass;
  }[];
  declaredDiplomas: string[];
  wishedActivities: string[];
}

export async function personOverview(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
  alertDays: number,
  day: Date = toParisDay(),
): Promise<PersonOverview> {
  authorize(actor, "person.full.read", { person: facts });
  const live = { personId, archivedAt: null };
  const [skills, languages, licenses, annexes, diplomas, activities] = await Promise.all([
    db.personSkill.findMany({
      where: live,
      orderBy: { label: "asc" },
      select: { id: true, label: true, level: true },
    }),
    db.personLanguage.findMany({
      where: live,
      orderBy: { label: "asc" },
      select: { id: true, label: true, level: true },
    }),
    db.personLicense.findMany({
      where: live,
      orderBy: { category: "asc" },
      select: { id: true, category: true },
    }),
    db.personAnnex.findMany({
      where: live,
      orderBy: { code: "asc" },
      select: { id: true, code: true, label: true, validUntil: true },
    }),
    db.personDeclaredDiploma.findMany({
      where: { personId },
      orderBy: { label: "asc" },
      select: { label: true },
    }),
    db.personWishedActivity.findMany({
      where: { personId },
      orderBy: { label: "asc" },
      select: { label: true },
    }),
  ]);
  return {
    skills,
    languages,
    licenses,
    annexes: annexes.map((a) => ({
      ...a,
      deadline: classifyDeadline(a.validUntil, day, alertDays),
    })),
    declaredDiplomas: diplomas.map((d) => d.label),
    wishedActivities: activities.map((a) => a.label),
  };
}

// ---------------------------------------------------------------------------
// Formations
// ---------------------------------------------------------------------------

export interface TrainingLine {
  id: string;
  ref: string;
  code: string;
  label: string;
  result: TrainingResult;
  date: Date | null;
  expiresAt: Date | null;
  /** Deadline of this record when it is PASSED and not cancelled. */
  deadline: DeadlineClass | null;
  place: string | null;
  cancelled: boolean;
}

export interface PersonTrainings {
  groups: { category: ReferenceCategory; lines: TrainingLine[] }[];
  qualifications: QualificationState[];
  counts: Record<DeadlineClass, number>;
  wishes: {
    id: string;
    code: string;
    label: string;
    status: TrainingWishStatus;
    comment: string | null;
  }[];
}

const CATEGORY_ORDER: ReferenceCategory[] = [
  "TRONC_COMMUN",
  "FORMATION_IS",
  "SECOURS",
  "FORMATION_GP",
  "AUTRE",
];

export async function personTrainings(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
  alertDays: number,
  day: Date = toParisDay(),
): Promise<PersonTrainings> {
  authorize(actor, "training.read", { person: facts });
  const [records, wishes] = await Promise.all([
    db.trainingRecord.findMany({
      where: { personId },
      orderBy: [{ date: { sort: "desc", nulls: "last" } }, { ref: "desc" }],
      select: {
        id: true,
        ref: true,
        referenceId: true,
        result: true,
        date: true,
        expiresAt: true,
        place: true,
        cancelledAt: true,
        reference: { select: { code: true, label: true, category: true, sortOrder: true } },
      },
    }),
    db.trainingWish.findMany({
      where: { personId, status: { in: ["OPEN", "WAITLISTED", "SCHEDULED"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      select: {
        id: true,
        status: true,
        comment: true,
        reference: { select: { code: true, label: true } },
      },
    }),
  ]);
  const qualifications = qualificationsOf(
    records.map((r) => ({ ...r, ...r.reference })),
    day,
    alertDays,
  );
  const groups = CATEGORY_ORDER.flatMap((category) => {
    const lines = records
      .filter((r) => r.reference.category === category)
      .map((r) => ({
        id: r.id,
        ref: r.ref,
        code: r.reference.code,
        label: r.reference.label,
        result: r.result,
        date: r.date,
        expiresAt: r.expiresAt,
        deadline:
          r.result === "PASSED" && r.cancelledAt === null
            ? classifyDeadline(r.expiresAt, day, alertDays)
            : null,
        place: r.place,
        cancelled: r.cancelledAt !== null,
      }));
    return lines.length > 0 ? [{ category, lines }] : [];
  });
  return {
    groups,
    qualifications,
    counts: deadlineCounts(qualifications),
    wishes: wishes.map((w) => ({
      id: w.id,
      code: w.reference.code,
      label: w.reference.label,
      status: w.status,
      comment: w.comment,
    })),
  };
}

// ---------------------------------------------------------------------------
// Fonctions
// ---------------------------------------------------------------------------

export interface AppointmentLine {
  id: string;
  ref: string;
  code: string;
  label: string;
  startDate: Date | null;
  endDate: Date | null;
  authorizedBy: string | null;
  decisionRef: string | null;
  cancelledAt: Date | null;
  cancelReason: string | null;
}

export interface PersonAppointments {
  active: AppointmentLine[];
  past: AppointmentLine[];
  cancelled: AppointmentLine[];
}

export async function personAppointments(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
  day: Date = toParisDay(),
): Promise<PersonAppointments> {
  authorize(actor, "appointment.read", { person: facts });
  const rows = await db.appointment.findMany({
    where: { personId },
    orderBy: [{ startDate: { sort: "desc", nulls: "last" } }, { ref: "desc" }],
    select: {
      id: true,
      ref: true,
      startDate: true,
      endDate: true,
      authorizedBy: true,
      decisionRef: true,
      cancelledAt: true,
      cancelReason: true,
      reference: { select: { code: true, label: true } },
    },
  });
  const result: PersonAppointments = { active: [], past: [], cancelled: [] };
  for (const row of rows) {
    const line: AppointmentLine = {
      id: row.id,
      ref: row.ref,
      code: row.reference.code,
      label: row.reference.label,
      startDate: row.startDate,
      endDate: row.endDate,
      authorizedBy: row.authorizedBy,
      decisionRef: row.decisionRef,
      cancelledAt: row.cancelledAt,
      cancelReason: row.cancelReason,
    };
    if (row.cancelledAt) result.cancelled.push(line);
    else if (isAppointmentActive({ ...row, perimeters: [] }, day)) result.active.push(line);
    else result.past.push(line);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Suivi
// ---------------------------------------------------------------------------

export interface PersonFollowUp {
  followUps: {
    id: string;
    kind: FollowUpKind;
    scheduledAt: Date | null;
    doneAt: Date | null;
    conductedBy: string | null;
    summary: string | null;
    nextDate: Date | null;
    cancelledAt: Date | null;
    cancelReason: string | null;
  }[];
  mentorships: {
    id: string;
    role: "mentee" | "mentor";
    otherName: string;
    otherRef: string;
    startDate: Date;
    endDate: Date | null;
    note: string | null;
  }[];
}

export async function personFollowUp(
  db: DbOrTx,
  actor: Actor,
  personId: string,
  facts: PersonFacts,
): Promise<PersonFollowUp> {
  authorize(actor, "followUp.manage", { person: facts });
  const other = { select: { firstName: true, lastName: true, ref: true } };
  const [followUps, mentorships] = await Promise.all([
    db.followUp.findMany({
      where: { personId },
      orderBy: [{ scheduledAt: { sort: "desc", nulls: "last" } }],
      select: {
        id: true,
        kind: true,
        scheduledAt: true,
        doneAt: true,
        summary: true,
        nextDate: true,
        cancelledAt: true,
        cancelReason: true,
        conductedBy: { select: { name: true } },
      },
    }),
    db.mentorship.findMany({
      where: { OR: [{ menteeId: personId }, { mentorId: personId }] },
      orderBy: { startDate: "desc" },
      select: {
        id: true,
        menteeId: true,
        startDate: true,
        endDate: true,
        note: true,
        mentee: other,
        mentor: other,
      },
    }),
  ]);
  return {
    followUps: followUps.map((f) => ({
      id: f.id,
      kind: f.kind,
      cancelledAt: f.cancelledAt,
      cancelReason: f.cancelReason,
      scheduledAt: f.scheduledAt,
      doneAt: f.doneAt,
      conductedBy: f.conductedBy?.name ?? null,
      summary: f.summary,
      nextDate: f.nextDate,
    })),
    mentorships: mentorships.map((m) => {
      const role = m.menteeId === personId ? "mentee" : "mentor";
      const counterpart = role === "mentee" ? m.mentor : m.mentee;
      return {
        id: m.id,
        role,
        otherName: `${counterpart.firstName} ${counterpart.lastName}`,
        otherRef: counterpart.ref,
        startDate: m.startDate,
        endDate: m.endDate,
        note: m.note,
      };
    }),
  };
}
