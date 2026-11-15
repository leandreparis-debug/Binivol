"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  cancelSchema,
  groupEntrySchema,
  matrixCellSchema,
  recordUpdateSchema,
  referenceSchema,
  resultsSchema,
  scheduleSchema,
  sessionSchema,
  wishSchema,
} from "@/lib/trainingForms";
import { toParisDay } from "@/lib/dates";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { matrixCellDetail } from "@/server/services/matrix";
import { sendUrgenceSummary } from "@/server/services/urgence";
import { loadPersonFacts } from "@/server/policy/facts";
import {
  addTrainingWish,
  cancelSession,
  cancelTrainingRecord,
  createSession,
  recordTrainingGroup,
  scheduleWish,
  setTrainingResults,
  trainingRecordPersonFacts,
  updateReferenceItem,
} from "@/server/services/trainings";

/*
 * Trainings actions (step 10). Each person concerned is authorised again by
 * the service (`training.write` on her), whatever the action's own rule.
 */

const refresh = () => {
  revalidatePath("/formations", "layout");
  revalidatePath("/benevoles/[ref]", "page");
};

export const createSessionAction = defineAction({
  action: "trainingSession.manage",
  input: sessionSchema,
  handler: async ({ input, actor }) => {
    const id = await createSession(getDb(), actor, input);
    refresh();
    return { id };
  },
});

export const cancelSessionAction = defineAction({
  action: "trainingSession.manage",
  input: cancelSchema,
  handler: async ({ input, actor }) => {
    await cancelSession(getDb(), actor, { sessionId: input.id, reason: input.reason });
    refresh();
    return null;
  },
});

/** Group (or single) entry: returns the warnings first, saves once they are accepted. */
export const recordGroupAction = defineAction({
  action: "trainingSession.manage",
  input: groupEntrySchema,
  handler: async ({ input, actor }) => {
    const result = await recordTrainingGroup(getDb(), actor, input);
    if (result.saved) refresh();
    return result;
  },
});

/** Single entry from a person's page (FORMAT, TOPAZE: `training.write` on her). */
export const recordForPersonAction = defineAction({
  action: "training.write",
  input: groupEntrySchema,
  resource: async (input) => {
    const [personId] = input.personIds;
    const facts = personId ? await loadPersonFacts(getDb(), personId, toParisDay()) : null;
    if (!facts || input.personIds.length !== 1) {
      throw new DomainError("INVALID_DATA", "Personne introuvable.");
    }
    return { person: facts };
  },
  handler: async ({ input, actor }) => {
    const result = await recordTrainingGroup(getDb(), actor, input);
    if (result.saved) refresh();
    return result;
  },
});

/** The person of a training line, as the resource of a line edit (404-like when absent). */
const recordPerson = async (input: { id: string }) => {
  const facts = await trainingRecordPersonFacts(getDb(), input.id);
  if (!facts) throw new DomainError("INVALID_DATA", "Ligne introuvable.");
  return { person: facts };
};

/** Lines behind a cell of the matrix, loaded when it is clicked (`training.read` on her). */
export const matrixCellAction = defineAction({
  action: "training.read",
  input: matrixCellSchema,
  resource: async (input) => {
    const facts = await loadPersonFacts(getDb(), input.personId, toParisDay());
    if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
    return { person: facts };
  },
  handler: ({ input, actor }) => matrixCellDetail(getDb(), actor, input),
});

/** Result and date of one line, from the matrix (`training.write` on her). */
export const updateRecordForPersonAction = defineAction({
  action: "training.write",
  input: recordUpdateSchema,
  resource: recordPerson,
  handler: async ({ input, actor }) => {
    await setTrainingResults(getDb(), actor, {
      recordIds: [input.id],
      result: input.result,
      date: input.date,
    });
    refresh();
    return null;
  },
});

/** Cancels one line, from the matrix (`training.write` on her): reason required, never deleted. */
export const cancelRecordForPersonAction = defineAction({
  action: "training.write",
  input: cancelSchema,
  resource: recordPerson,
  handler: async ({ input, actor }) => {
    await cancelTrainingRecord(getDb(), actor, { recordId: input.id, reason: input.reason });
    refresh();
    return null;
  },
});

export const setResultsAction = defineAction({
  action: "trainingSession.manage",
  input: resultsSchema,
  handler: async ({ input, actor }) => {
    const n = await setTrainingResults(getDb(), actor, input);
    refresh();
    return { updated: n };
  },
});

export const cancelRecordAction = defineAction({
  action: "trainingSession.manage",
  input: cancelSchema,
  handler: async ({ input, actor }) => {
    await cancelTrainingRecord(getDb(), actor, { recordId: input.id, reason: input.reason });
    refresh();
    return null;
  },
});

export const addWishAction = defineAction({
  action: "trainingWish.manage",
  input: wishSchema,
  resource: async (input) => {
    const facts = await loadPersonFacts(getDb(), input.personId, toParisDay());
    if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
    return { person: facts };
  },
  handler: async ({ input, actor }) => {
    const id = await addTrainingWish(getDb(), actor, input);
    refresh();
    return { id };
  },
});

export const scheduleWishAction = defineAction({
  action: "trainingSession.manage",
  input: scheduleSchema,
  handler: async ({ input, actor }) => {
    const id = await scheduleWish(getDb(), actor, input);
    refresh();
    return { id };
  },
});

export const updateReferenceAction = defineAction({
  action: "reference.manage",
  input: referenceSchema,
  handler: async ({ input, actor }) => {
    await updateReferenceItem(getDb(), actor, input);
    refresh();
    return null;
  },
});

export const sendUrgenceSummaryAction = defineAction({
  action: "trainingSession.manage",
  input: z.object({}),
  handler: async ({ actor }) => {
    const { outcome, people } = await sendUrgenceSummary(getDb(), actor);
    if (outcome === "FAILED") {
      throw new DomainError(
        "INVALID_DATA",
        "L'e-mail n'a pas pu partir. L'échec est visible dans les réglages.",
      );
    }
    return people;
  },
});
