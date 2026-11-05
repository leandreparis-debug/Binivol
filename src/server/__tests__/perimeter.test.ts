// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  computePerimeters,
  type PerimeterAppointment,
  type PerimeterTrainingRecord,
} from "@/server/perimeter";

const day = new Date("2026-11-04T00:00:00.000Z");
const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const record = (over: Partial<PerimeterTrainingRecord>): PerimeterTrainingRecord => ({
  result: "PASSED",
  expiresAt: null,
  cancelledAt: null,
  perimeters: ["ACTION"],
  ...over,
});
const appointment = (over: Partial<PerimeterAppointment>): PerimeterAppointment => ({
  startDate: d("2025-01-01"),
  endDate: null,
  cancelledAt: null,
  perimeters: ["FORMAT_GP"],
  ...over,
});
const sorted = (set: Set<string>) => [...set].sort();

describe("computePerimeters", () => {
  it("returns nothing without qualification", () => {
    expect(computePerimeters({ records: [], appointments: [] }, day).size).toBe(0);
  });

  it("counts a passed training without expiry", () => {
    expect(sorted(computePerimeters({ records: [record({})], appointments: [] }, day))).toEqual([
      "ACTION",
    ]);
  });

  it.each(["REGISTERED", "FAILED", "ABSENT", "TO_CONFIRM"] as const)(
    "ignores a %s training",
    (result) => {
      expect(computePerimeters({ records: [record({ result })], appointments: [] }, day).size).toBe(
        0,
      );
    },
  );

  it("ignores an expired training but keeps one expiring today", () => {
    expect(
      computePerimeters(
        { records: [record({ expiresAt: d("2026-11-03") })], appointments: [] },
        day,
      ).size,
    ).toBe(0);
    expect(
      computePerimeters(
        { records: [record({ expiresAt: d("2026-11-04") })], appointments: [] },
        day,
      ).size,
    ).toBe(1);
  });

  it("ignores a cancelled training", () => {
    expect(
      computePerimeters({ records: [record({ cancelledAt: new Date() })], appointments: [] }, day)
        .size,
    ).toBe(0);
  });

  it("counts an active appointment and ignores a cancelled, ended or future one", () => {
    expect(
      sorted(computePerimeters({ records: [], appointments: [appointment({})] }, day)),
    ).toEqual(["FORMAT_GP"]);
    for (const over of [
      { cancelledAt: new Date() },
      { endDate: d("2026-10-31") },
      { startDate: d("2026-12-01") },
    ]) {
      expect(computePerimeters({ records: [], appointments: [appointment(over)] }, day).size).toBe(
        0,
      );
    }
  });

  it("counts an appointment without a start date, not cancelled and without an end, as active", () => {
    expect(
      sorted(
        computePerimeters(
          { records: [], appointments: [appointment({ startDate: null, endDate: null })] },
          day,
        ),
      ),
    ).toEqual(["FORMAT_GP"]);
    expect(
      computePerimeters(
        { records: [], appointments: [appointment({ startDate: null, endDate: d("2024-12-31") })] },
        day,
      ).size,
    ).toBe(0);
  });

  it("adds FORMAT_GP for a trainer, and only when the flag is true", () => {
    expect(
      sorted(computePerimeters({ records: [], appointments: [], isTrainer: true }, day)),
    ).toEqual(["FORMAT_GP"]);
    expect(computePerimeters({ records: [], appointments: [], isTrainer: false }, day).size).toBe(
      0,
    );
    expect(computePerimeters({ records: [], appointments: [], isTrainer: null }, day).size).toBe(0);
  });

  it("combines perimeters from trainings and appointments", () => {
    const result = computePerimeters(
      {
        records: [record({ perimeters: ["ACTION", "LASER"] }), record({ perimeters: ["LASER"] })],
        appointments: [appointment({})],
      },
      day,
    );
    expect(sorted(result)).toEqual(["ACTION", "FORMAT_GP", "LASER"]);
  });
});
