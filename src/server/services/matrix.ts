import type { ReferenceCategory } from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import { matrixCell, type MatrixCell } from "@/lib/matrix";
import { loadAlertPeople } from "../alerts/load";
import { statesOf } from "../alerts/rules";
import type { DbOrTx } from "../db";
import { authorize, canSome } from "../policy/can";
import { newVolunteerMonths } from "../policy/facts";
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
    db.$queryRaw<{ id: string }[]>`
      SELECT p.id FROM persons p
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
