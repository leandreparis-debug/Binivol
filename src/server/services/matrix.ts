import type { ReferenceCategory, TrainingResult } from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import { matrixCell, type MatrixCell } from "@/lib/matrix";
import { loadAlertPeople } from "../alerts/load";
import { statesOf } from "../alerts/rules";
import type { DbOrTx } from "../db";
import { DomainError } from "../errors";
import { authorize, can, canSome } from "../policy/can";
import { loadPersonFacts, newVolunteerMonths } from "../policy/facts";
import { trainingState } from "../qualification";
import type { Actor } from "../policy/types";
import { visibleSql } from "../policy/visibility";
import { numericSettings } from "../settings";

/**
 * Competence matrix (step 13, legacy « Matrice »): present volunteers of the
 * actor's perimeter (`training.read`, filtered in SQL) × trainings of the
 * reference list, each cell from the single state of step 10.
 */

export const MATRIX_CATEGORIES: readonly ReferenceCategory[] = [
  "TRONC_COMMUN",
  "SECOURS",
  "FORMATION_IS",
  "FORMATION_GP",
];

export interface MatrixView {
  category: ReferenceCategory | null;
  columns: { id: string; code: string; label: string }[];
  rows: {
    id: string;
    ref: string;
    name: string;
    /** `training.write` on this person: her cells open the editing dialog. */
    canWrite: boolean;
    cells: MatrixCell[];
  }[];
}

export async function matrixView(
  db: DbOrTx,
  actor: Actor,
  filter: { category: ReferenceCategory | null },
  day: Date = toParisDay(),
): Promise<MatrixView> {
  if (!canSome(actor, "training.read")) authorize(actor, "training.read");
  const ctx = { day, newVolunteerMonths: await newVolunteerMonths(db) };
  const [visible, items, { alertDays }] = await Promise.all([
    db.$queryRaw<{ id: string; can_write: boolean }[]>`
      SELECT p.id, (${visibleSql(actor, "training.write", ctx)}) AS can_write FROM persons p
      WHERE ${visibleSql(actor, "training.read", ctx)} AND p.archived_at IS NULL
        AND p.status IN ('ACTIVE'::"PersonStatus", 'PAUSED'::"PersonStatus", 'SUSPENDED'::"PersonStatus")`,
    db.referenceItem.findMany({
      where: {
        kind: "TRAINING",
        active: true,
        ...(filter.category ? { category: filter.category } : {}),
      },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, label: true },
    }),
    numericSettings(db),
  ]);
  const { people } = await loadAlertPeople(
    db,
    visible.map((v) => v.id),
    day,
  );
  const writable = new Set(visible.filter((v) => v.can_write).map((v) => v.id));
  people.sort(
    (a, b) =>
      a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr"),
  );
  return {
    category: filter.category,
    columns: items,
    rows: people.map((p) => {
      const states = statesOf(p, day, alertDays);
      return {
        id: p.id,
        ref: p.ref,
        name: `${p.lastName} ${p.firstName}`,
        canWrite: writable.has(p.id),
        cells: items.map((item) => {
          const state = states.get(item.id);
          if (!state) return matrixCell({ status: "NONE", expiresAt: null }, item.code);
          const registeredAt =
            state.status === "REGISTERED"
              ? (p.records
                  .filter((r) => r.referenceId === item.id && r.result === "REGISTERED")
                  .map((r) => r.sessionStart ?? r.date)
                  .filter((d): d is Date => d !== null && d.getTime() >= day.getTime())
                  .sort((x, y) => x.getTime() - y.getTime())[0] ?? null)
              : null;
          return matrixCell({ ...state, registeredAt }, item.code);
        }),
      };
    }),
  };
}

/** One live line of a matrix cell (cancelled lines are not shown). */
export interface MatrixCellRecord {
  id: string;
  result: TrainingResult;
  /** `AAAA-MM-JJ` (obtention or training date), or null. */
  date: string | null;
  expiresAt: string | null;
  place: string | null;
  comment: string | null;
  /** Start of the linked session (`AAAA-MM-JJ`), if any. */
  sessionStart: string | null;
}

/** What the dialog of a matrix cell shows: the state and the live lines. */
export interface MatrixCellDetail {
  personId: string;
  personName: string;
  reference: { id: string; code: string; label: string };
  cell: MatrixCell;
  canWrite: boolean;
  records: MatrixCellRecord[];
}

const isoDay = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

/**
 * The lines behind one cell of the matrix (person × training), loaded on
 * demand when the cell is clicked. Requires `training.read` on the person;
 * `canWrite` tells whether she may be edited (`training.write`). A person or
 * a training that does not exist (or a function) is « introuvable ».
 */
export async function matrixCellDetail(
  db: DbOrTx,
  actor: Actor,
  input: { personId: string; referenceId: string },
  day: Date = toParisDay(),
): Promise<MatrixCellDetail> {
  const facts = await loadPersonFacts(db, input.personId, day);
  if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  authorize(actor, "training.read", { person: facts });
  const [person, reference, records, { alertDays }] = await Promise.all([
    db.person.findUniqueOrThrow({
      where: { id: input.personId },
      select: { firstName: true, lastName: true },
    }),
    db.referenceItem.findUnique({
      where: { id: input.referenceId },
      select: { id: true, code: true, label: true, kind: true },
    }),
    db.trainingRecord.findMany({
      where: { personId: input.personId, referenceId: input.referenceId, cancelledAt: null },
      orderBy: [{ date: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      select: {
        id: true,
        result: true,
        date: true,
        expiresAt: true,
        place: true,
        comment: true,
        cancelledAt: true,
        session: { select: { startDate: true } },
      },
    }),
    numericSettings(db),
  ]);
  if (reference?.kind !== "TRAINING") {
    throw new DomainError("INVALID_DATA", "Formation introuvable.");
  }
  const state = trainingState(
    records.map((r) => ({ ...r, sessionStart: r.session?.startDate ?? null })),
    day,
    alertDays,
  );
  const registeredAt =
    state.status === "REGISTERED"
      ? (records
          .filter((r) => r.result === "REGISTERED")
          .map((r) => r.session?.startDate ?? r.date)
          .filter((d): d is Date => d !== null && d.getTime() >= day.getTime())
          .sort((x, y) => x.getTime() - y.getTime())[0] ?? null)
      : null;
  return {
    personId: input.personId,
    personName: `${person.lastName} ${person.firstName}`,
    reference: { id: reference.id, code: reference.code, label: reference.label },
    cell: matrixCell({ ...state, registeredAt }, reference.code),
    canWrite: can(actor, "training.write", { person: facts }).allowed,
    records: records.map((r) => ({
      id: r.id,
      result: r.result,
      date: isoDay(r.date),
      expiresAt: isoDay(r.expiresAt),
      place: r.place,
      comment: r.comment,
      sessionStart: isoDay(r.session?.startDate ?? null),
    })),
  };
}
