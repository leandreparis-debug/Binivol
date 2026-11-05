"use server";

import { revalidatePath } from "next/cache";
import {
  cancelSchema,
  groupEntrySchema,
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
import { loadPersonFacts } from "@/server/policy/facts";
import {
  addTrainingWish,
  cancelSession,
  cancelTrainingRecord,
  createSession,
  recordTrainingGroup,
  scheduleWish,
  setTrainingResults,
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
