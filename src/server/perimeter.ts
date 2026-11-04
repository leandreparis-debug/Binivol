import type { Perimeter, TrainingResult } from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import type { DbOrTx } from "./db";
import { isValidOn } from "./reference";

/**
 * Perimeters of a person (ACTION, LASER, FORMAT_GP), derived from the data:
 * the reference list says which qualification brings which perimeter, so the
 * visibility rules of step 3 need no hard-coded code list.
 */

export interface PerimeterTrainingRecord {
  result: TrainingResult;
  expiresAt: Date | null;
  cancelledAt: Date | null;
  perimeters: readonly Perimeter[];
}

export interface PerimeterAppointment {
  startDate: Date | null;
  endDate: Date | null;
  cancelledAt: Date | null;
  perimeters: readonly Perimeter[];
}

/** A training counts when it is PASSED, not cancelled, and not expired on `day`. */
export function isRecordEffective(record: PerimeterTrainingRecord, day: Date): boolean {
  return (
    record.result === "PASSED" && record.cancelledAt === null && isValidOn(record.expiresAt, day)
  );
}

/** An appointment counts when it is not cancelled and `day` lies within its dates. */
export function isAppointmentActive(appointment: PerimeterAppointment, day: Date): boolean {
  if (appointment.cancelledAt !== null) return false;
  if (appointment.startDate && appointment.startDate.getTime() > day.getTime()) return false;
  return isValidOn(appointment.endDate, day);
}

/**
 * Pure version: the set of perimeters brought by effective trainings and
 * active appointments on `day` (default: today in Paris, 00:00 UTC).
 */
export function computePerimeters(
  input: { records: PerimeterTrainingRecord[]; appointments: PerimeterAppointment[] },
  day: Date = toParisDay(),
): Set<Perimeter> {
  const result = new Set<Perimeter>();
  for (const record of input.records) {
    if (isRecordEffective(record, day)) record.perimeters.forEach((p) => result.add(p));
  }
  for (const appointment of input.appointments) {
    if (isAppointmentActive(appointment, day)) appointment.perimeters.forEach((p) => result.add(p));
  }
  return result;
}

/**
 * Query version: loads the person's trainings and appointments whose reference
 * carries at least one perimeter, then applies `computePerimeters`.
 */
export async function perimetersOf(
  db: DbOrTx,
  personId: string,
  day: Date = toParisDay(),
): Promise<Set<Perimeter>> {
  const withPerimeters = { perimeters: { isEmpty: false } };
  const [records, appointments] = await Promise.all([
    db.trainingRecord.findMany({
      where: { personId, result: "PASSED", cancelledAt: null, reference: withPerimeters },
      select: {
        result: true,
        expiresAt: true,
        cancelledAt: true,
        reference: { select: { perimeters: true } },
      },
    }),
    db.appointment.findMany({
      where: { personId, cancelledAt: null, reference: withPerimeters },
      select: {
        startDate: true,
        endDate: true,
        cancelledAt: true,
        reference: { select: { perimeters: true } },
      },
    }),
  ]);
  return computePerimeters(
    {
      records: records.map((r) => ({ ...r, perimeters: r.reference.perimeters })),
      appointments: appointments.map((a) => ({ ...a, perimeters: a.reference.perimeters })),
    },
    day,
  );
}
