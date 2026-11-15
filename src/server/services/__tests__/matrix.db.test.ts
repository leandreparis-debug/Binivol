import { beforeAll, describe, expect, it } from "vitest";
import { seedDemo, seedUserEmail } from "../../../../prisma/seed/index";
import { loadActor } from "@/server/auth/loadActor";
import { can, ForbiddenError } from "@/server/policy/can";
import { loadPersonFactsMany } from "@/server/policy/facts";
import type { Actor } from "@/server/policy/types";
import { matrixCellDetail, matrixView } from "@/server/services/matrix";
import {
  cancelTrainingRecord,
  recordTrainingGroup,
  setTrainingResults,
} from "@/server/services/trainings";
import { getTestDb } from "@/test/db/testDatabase";

const db = getTestDb();
const day = new Date("2026-11-06T00:00:00.000Z");
const actors: Record<string, Actor> = {};

function who(key: string): Actor {
  const a = actors[key];
  if (!a) throw new Error(key);
  return a;
}

beforeAll(async () => {
  await seedDemo(db, { today: day });
  for (const key of ["topaze", "action", "laser", "format", "format-gp", "diamant"]) {
    const user = await db.user.findUniqueOrThrow({ where: { email: seedUserEmail(key) } });
    const actor = await loadActor(db, user.id);
    if (!actor) throw new Error(key);
    actors[key] = actor;
  }
}, 180_000);

describe("matrix: editable cells", () => {
  it.each(["topaze", "action", "laser", "format", "format-gp", "diamant"])(
    "%s: a row is editable exactly when can() allows training.write on the person",
    async (key) => {
      const actor = who(key);
      const view = await matrixView(db, actor, { category: null }, day);
      const facts = await loadPersonFactsMany(
        db,
        view.rows.map((r) => r.id),
        day,
      );
      for (const row of view.rows) {
        const person = facts.get(row.id);
        if (!person) throw new Error(row.id);
        expect(row.canWrite, `${key} ${row.ref}`).toBe(
          can(actor, "training.write", { person }).allowed,
        );
      }
      if (key === "topaze" || key === "format") {
        expect(view.rows.length).toBeGreaterThan(0);
        expect(view.rows.every((r) => r.canWrite)).toBe(true);
      }
      if (key === "action" || key === "laser")
        expect(view.rows.some((r) => r.canWrite)).toBe(false);
    },
  );
});

describe("matrix: the lines of a cell", () => {
  it("adds, changes and removes a line; the cell follows; everything is audited", async () => {
    const view = await matrixView(db, who("format"), { category: null }, day);
    const ecg = await db.referenceItem.findUniqueOrThrow({ where: { code: "ECG" } });
    // A person without any ECG line yet.
    const lines = await db.trainingRecord.findMany({
      where: { referenceId: ecg.id },
      select: { personId: true },
    });
    const row = view.rows.find((r) => !lines.some((l) => l.personId === r.id));
    if (!row) throw new Error("no person without ECG");
    const cell = { personId: row.id, referenceId: ecg.id };

    const empty = await matrixCellDetail(db, who("format"), cell, day);
    expect(empty).toMatchObject({ canWrite: true, records: [], cell: { tone: "none" } });
    expect(empty.reference.code).toBe("ECG");

    // Add (accepting the warnings if any, like « Enregistrer quand même »).
    const input = {
      referenceId: ecg.id,
      date: new Date("2026-10-01T00:00:00.000Z"),
      result: "PASSED" as const,
      personIds: [row.id],
    };
    let added = await recordTrainingGroup(db, who("format"), input, day);
    if (!added.saved) {
      added = await recordTrainingGroup(
        db,
        who("format"),
        { ...input, acceptedWarnings: added.warningsKey },
        day,
      );
    }
    if (!added.saved) throw new Error("not saved");
    const [recordId] = added.recordIds;
    if (!recordId) throw new Error("no id");
    const afterAdd = await matrixCellDetail(db, who("format"), cell, day);
    expect(afterAdd.records).toMatchObject([
      { id: recordId, result: "PASSED", date: "2026-10-01" },
    ]);
    expect(afterAdd.cell.tone).toBe("ok");

    // Change: the result (expiry recomputed: no expiry for a failure).
    await setTrainingResults(
      db,
      who("format"),
      { recordIds: [recordId], result: "FAILED", date: null },
      day,
    );
    const afterChange = await matrixCellDetail(db, who("format"), cell, day);
    expect(afterChange.records).toMatchObject([
      { id: recordId, result: "FAILED", date: "2026-10-01", expiresAt: null },
    ]);
    expect(afterChange.cell.tone).toBe("none");

    // Remove: cancelled with a reason, never deleted, hidden from the cell.
    await cancelTrainingRecord(db, who("format"), { recordId, reason: "Saisie en double" }, day);
    expect((await matrixCellDetail(db, who("format"), cell, day)).records).toEqual([]);
    const kept = await db.trainingRecord.findUniqueOrThrow({ where: { id: recordId } });
    expect(kept.cancelReason).toBe("Saisie en double");

    const audit = await db.auditLog.findMany({
      where: { entity: "TrainingRecord", entityId: recordId },
      select: { action: true },
    });
    expect(new Set(audit.map((a) => a.action))).toEqual(new Set(["CREATE", "UPDATE", "CANCEL"]));
  });

  it("reads a cell with training.read, writes only with training.write", async () => {
    const view = await matrixView(db, who("action"), { category: null }, day);
    const row = view.rows[0];
    if (!row) throw new Error("ACTION sees nobody");
    const pse = await db.referenceItem.findUniqueOrThrow({ where: { code: "PSE" } });
    const cell = { personId: row.id, referenceId: pse.id };
    const detail = await matrixCellDetail(db, who("action"), cell, day);
    expect(detail.canWrite).toBe(false);
    await expect(
      recordTrainingGroup(
        db,
        who("action"),
        { referenceId: pse.id, date: day, result: "PASSED", personIds: [row.id] },
        day,
      ),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const line = detail.records[0];
    if (line) {
      await expect(
        cancelTrainingRecord(db, who("action"), { recordId: line.id, reason: "Essai" }, day),
      ).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("refuses a person outside training.read, and a function instead of a training", async () => {
    const candidate = await db.person.findFirstOrThrow({ where: { status: "CANDIDATE" } });
    const pse = await db.referenceItem.findUniqueOrThrow({ where: { code: "PSE" } });
    await expect(
      matrixCellDetail(db, who("format"), { personId: candidate.id, referenceId: pse.id }, day),
    ).rejects.toBeInstanceOf(ForbiddenError);
    const someone = (await matrixView(db, who("topaze"), { category: null }, day)).rows[0];
    const fn = await db.referenceItem.findUniqueOrThrow({ where: { code: "CHEF_PAPS" } });
    await expect(
      matrixCellDetail(db, who("topaze"), { personId: someone?.id ?? "", referenceId: fn.id }, day),
    ).rejects.toThrow("Formation introuvable.");
  });
});
