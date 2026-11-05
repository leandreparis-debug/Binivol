"use server";

import { revalidatePath } from "next/cache";
import {
  assignMentorSchema,
  candidacyUpdateSchema,
  endMentorshipSchema,
  finalizeSchema,
  newCandidateSchema,
  reengageSchema,
  stageChangeSchema,
} from "@/lib/candidacyForms";
import { toParisDay } from "@/lib/dates";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { loadPersonFacts } from "@/server/policy/facts";
import { can } from "@/server/policy/can";
import type { PolicyResource } from "@/server/policy/types";
import { attestationState, completeAttestation } from "@/server/dossier/signing";
import { getStorage } from "@/server/storage";
import {
  assignMentor,
  candidacyPerson,
  changeStage,
  createCandidate,
  endMentorship,
  finalizeCandidacy,
  mentorshipMentee,
  reengagePerson,
  updateCandidacy,
} from "@/server/services/candidacies";

async function personResource(personId: string | null): Promise<PolicyResource> {
  const facts = personId ? await loadPersonFacts(getDb(), personId, toParisDay()) : null;
  if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  return { person: facts };
}

const refresh = () => {
  revalidatePath("/candidats");
  revalidatePath("/benevoles/[ref]", "page");
};

/** New candidate. Returns the duplicates when people match (nothing written then). */
export const createCandidateAction = defineAction({
  action: "candidacy.create",
  input: newCandidateSchema,
  handler: async ({ input, actor }) => {
    const outcome = await createCandidate(getDb(), actor, input);
    if (outcome.status === "created") refresh();
    return outcome;
  },
});

/** New candidacy on the page of a person who left or is inactive. */
export const reengageAction = defineAction({
  action: "candidacy.create",
  input: reengageSchema,
  handler: async ({ input, actor }) => {
    const result = await reengagePerson(getDb(), actor, input);
    refresh();
    return result;
  },
});

export const changeStageAction = defineAction({
  action: "candidacy.manage",
  input: stageChangeSchema,
  resource: async (input) => personResource(await candidacyPerson(getDb(), input.candidacyId)),
  handler: async ({ input, actor }) => {
    await changeStage(getDb(), actor, input);
    refresh();
    return null;
  },
});

export const updateCandidacyAction = defineAction({
  action: "candidacy.manage",
  input: candidacyUpdateSchema,
  resource: async (input) => personResource(await candidacyPerson(getDb(), input.candidacyId)),
  handler: async ({ input, actor }) => {
    await updateCandidacy(getDb(), actor, input);
    refresh();
    return null;
  },
});

/** GAIA → DONE (DIAMANT, TOPAZE), in one transaction. */
export const finalizeAction = defineAction({
  action: "candidacy.manage",
  input: finalizeSchema,
  resource: async (input) => personResource(await candidacyPerson(getDb(), input.candidacyId)),
  handler: async ({ input, actor }) => {
    const result = await finalizeCandidacy(getDb(), actor, input);
    // Step 9: the aptitude certificate is completed with the NIVOL. A missing
    // storage (hosted demo) does not undo the closure: « Compléter l'attestation ».
    let attestation: { completed: boolean; message: string | null } = {
      completed: false,
      message: null,
    };
    const facts = await loadPersonFacts(getDb(), result.personId, toParisDay());
    if (facts && can(actor, "dossier.manage", { person: facts }).allowed) {
      try {
        const state = await attestationState(getDb(), result.personId);
        if (state === "pending") {
          await completeAttestation(getDb(), getStorage(), actor, result.personId);
          attestation = { completed: true, message: null };
        }
      } catch (error) {
        attestation = {
          completed: false,
          message:
            error instanceof DomainError
              ? error.message
              : "L'attestation d'aptitude sera complétée plus tard (« Compléter l'attestation »).",
        };
      }
    }
    refresh();
    return { ...result, attestation };
  },
});

export const assignMentorAction = defineAction({
  action: "mentorship.manage",
  input: assignMentorSchema,
  resource: (input) => personResource(input.menteeId),
  handler: async ({ input, actor }) => {
    const id = await assignMentor(getDb(), actor, input);
    refresh();
    return { id };
  },
});

export const endMentorshipAction = defineAction({
  action: "mentorship.manage",
  input: endMentorshipSchema,
  resource: async (input) => personResource(await mentorshipMentee(getDb(), input.mentorshipId)),
  handler: async ({ input, actor }) => {
    await endMentorship(getDb(), actor, input);
    refresh();
    return null;
  },
});
