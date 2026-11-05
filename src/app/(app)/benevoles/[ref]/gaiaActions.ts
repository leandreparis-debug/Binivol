"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toParisDay } from "@/lib/dates";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { completeAttestation } from "@/server/dossier/signing";
import { DomainError } from "@/server/errors";
import { loadPersonFacts } from "@/server/policy/facts";
import type { PersonFacts } from "@/server/policy/types";
import { readGaiaSheet, setGaiaChecklistItem, undoFinalize } from "@/server/services/gaia";
import { getStorage } from "@/server/storage";

/*
 * Gaia assistant (step 9): the sheet read on demand (journaled), the dated
 * checklist, the certificate completed with the NIVOL, and the undo of a
 * closure made by mistake (TOPAZE, 7 days).
 */

const id = z.string().min(1).max(40);

async function facts(personId: string): Promise<PersonFacts> {
  const found = await loadPersonFacts(getDb(), personId, toParisDay());
  if (!found) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  return found;
}

const refresh = () => {
  revalidatePath("/benevoles/[ref]", "page");
  revalidatePath("/candidats");
};

export const readGaiaSheetAction = defineAction({
  action: "candidacy.manage",
  input: z.object({ personId: id }),
  resource: async (input) => ({ person: await facts(input.personId) }),
  handler: async ({ input, actor }) =>
    readGaiaSheet(getDb(), actor, input.personId, await facts(input.personId)),
});

export const setGaiaChecklistAction = defineAction({
  action: "candidacy.manage",
  input: z.object({
    personId: id,
    candidacyId: id,
    key: z.string().min(1).max(40),
    checked: z.boolean(),
  }),
  resource: async (input) => ({ person: await facts(input.personId) }),
  handler: async ({ input, actor }) => {
    await setGaiaChecklistItem(getDb(), actor, input);
    refresh();
    return null;
  },
});

export const completeAttestationAction = defineAction({
  action: "dossier.manage",
  input: z.object({ personId: id }),
  resource: async (input) => ({ person: await facts(input.personId) }),
  handler: async ({ input, actor }) => {
    const done = await completeAttestation(getDb(), getStorage(), actor, input.personId);
    refresh();
    return done;
  },
});

export const undoFinalizeAction = defineAction({
  action: "candidacy.finalize.undo",
  input: z.object({
    personId: id,
    candidacyId: id,
    reason: z.string().trim().min(3, "Le motif est obligatoire.").max(500),
  }),
  resource: async (input) => ({ person: await facts(input.personId) }),
  handler: async ({ input, actor }) => {
    await undoFinalize(getDb(), actor, await facts(input.personId), input);
    refresh();
    return null;
  },
});
