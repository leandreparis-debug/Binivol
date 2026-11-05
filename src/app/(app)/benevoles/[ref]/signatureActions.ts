"use server";

import { revalidatePath } from "next/cache";
import { toParisDay } from "@/lib/dates";
import {
  countersignInput,
  pngFromDataUrl,
  requestCodeInput,
  resendSignedMailInput,
  signInPersonInput,
  signWithCodeInput,
} from "@/lib/signatureForms";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { loadPersonFacts } from "@/server/policy/facts";
import type { PersonFacts, PolicyResource } from "@/server/policy/types";
import { requestMeta } from "@/server/signature/request";
import {
  countersign,
  requestSignatureCode,
  resendSignedDocuments,
  signInPerson,
  signWithCode,
} from "@/server/signature/service";
import { getStorage } from "@/server/storage";

/*
 * Signature actions of a responsible (`dossier.manage` on the person): the
 * on-site mode (code, or identity checked in person), the counter-signature
 * of the charter, and « Renvoyer l'e-mail ».
 */

async function facts(personId: string | undefined): Promise<PersonFacts> {
  if (!personId) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  const found = await loadPersonFacts(getDb(), personId, toParisDay());
  if (!found) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  return found;
}

async function personResource(personId: string | undefined): Promise<PolicyResource> {
  return { person: await facts(personId) };
}

const refresh = () => {
  revalidatePath("/benevoles/[ref]", "page");
};

export const requestOnSiteCodeAction = defineAction({
  action: "dossier.manage",
  input: requestCodeInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input }) => {
    const sent = await requestSignatureCode(getDb(), {
      personId: (await facts(input.personId)).personId,
      role: input.role,
    });
    return { sentTo: sent.sentTo, expiresAt: sent.expiresAt.toISOString() };
  },
});

export const signOnSiteWithCodeAction = defineAction({
  action: "dossier.manage",
  input: signWithCodeInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input }) => {
    const personId = (await facts(input.personId)).personId;
    const view = await signWithCode(
      getDb(),
      getStorage(),
      {
        personId,
        linkId: null,
        role: input.role,
        inputKind: input.inputKind,
        png: pngFromDataUrl(input.image),
        code: input.code,
      },
      await requestMeta(),
    );
    refresh();
    return { next: view.next };
  },
});

export const signInPersonAction = defineAction({
  action: "dossier.manage",
  input: signInPersonInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const view = await signInPerson(
      getDb(),
      getStorage(),
      actor,
      await facts(input.personId),
      {
        personId: input.personId,
        role: input.role,
        inputKind: input.inputKind,
        png: pngFromDataUrl(input.image),
        identityChecked: input.identityChecked,
      },
      await requestMeta(),
    );
    refresh();
    return { next: view.next };
  },
});

export const countersignAction = defineAction({
  action: "dossier.manage",
  input: countersignInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const outcome = await countersign(
      getDb(),
      getStorage(),
      actor,
      await facts(input.personId),
      {
        personId: input.personId,
        png: pngFromDataUrl(input.image),
        inputKind: input.inputKind,
        firstName: input.firstName,
        lastName: input.lastName,
        quality: input.quality,
      },
      await requestMeta(),
    );
    // No revalidation here: the dialog shows its confirmation, « Terminer » refreshes the page.
    return { mailSent: outcome.mailSent, mailMessage: outcome.mailMessage };
  },
});

export const resendSignedMailAction = defineAction({
  action: "dossier.manage",
  input: resendSignedMailInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const outcome = await resendSignedDocuments(
      getDb(),
      getStorage(),
      actor,
      await facts(input.personId),
      input.personId,
    );
    refresh();
    return outcome;
  },
});
