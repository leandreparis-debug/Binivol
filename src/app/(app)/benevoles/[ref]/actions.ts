"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toParisDay } from "@/lib/dates";
import {
  archiveListItemSchema,
  identitySchema,
  nivolCorrectionSchema,
  personListItemSchema,
  statusChangeSchema,
} from "@/lib/personForms";
import { defineAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { loadPersonFacts } from "@/server/policy/facts";
import type { PolicyResource } from "@/server/policy/types";
import { documentOwner, readPersonSensitive } from "@/server/sensitive";
import { archiveDocument, uploadDocument } from "@/server/services/documents";
import {
  archivePersonListItem,
  changePersonStatus,
  correctPersonNivol,
  savePersonListItem,
  updatePersonIdentity,
} from "@/server/services/personWrites";
import { getStorage } from "@/server/storage";
import { uploadFormSchema } from "./schemas";

/** Facts of the person named by the input (the policy resource). */
async function personResource(personId: string): Promise<PolicyResource> {
  const facts = await loadPersonFacts(getDb(), personId, toParisDay());
  if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  return { person: facts };
}

const refresh = () => {
  revalidatePath("/benevoles/[ref]", "page");
};

/**
 * Shows the sensitive block. `readPersonSensitive` checks
 * `person.sensitive.read` again and writes the access log (SENSITIVE_VIEW).
 * Dates are sent as `AAAA-MM-JJ` text.
 */
export const revealSensitiveAction = defineAction({
  action: "person.sensitive.read",
  input: z.object({ personId: z.string().min(1).max(40) }),
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const view = await readPersonSensitive(getDb(), actor, input.personId, "fiche");
    const day = (d: Date | null) => d?.toISOString().slice(0, 10) ?? null;
    return {
      ...view,
      birthDate: day(view.birthDate),
      b3CheckedAt: day(view.b3CheckedAt),
      parentalAuthorizationDate: day(view.parentalAuthorizationDate),
    };
  },
});

export const changeStatusAction = defineAction({
  action: "person.status.change",
  input: statusChangeSchema,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    await changePersonStatus(getDb(), actor, input);
    refresh();
    return null;
  },
});

export const updateIdentityAction = defineAction({
  action: "person.update",
  input: identitySchema,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    await updatePersonIdentity(getDb(), actor, input);
    refresh();
    return null;
  },
});

export const correctNivolAction = defineAction({
  action: "person.nivol.correct",
  input: nivolCorrectionSchema,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    await correctPersonNivol(getDb(), actor, input);
    refresh();
    return null;
  },
});

export const saveListItemAction = defineAction({
  action: "person.update",
  input: personListItemSchema,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    await savePersonListItem(getDb(), actor, input);
    refresh();
    return null;
  },
});

export const archiveListItemAction = defineAction({
  action: "person.update",
  input: archiveListItemSchema,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    await archivePersonListItem(getDb(), actor, input);
    refresh();
    return null;
  },
});

/** Upload (FormData): checked by signature and size in the service. */
export const uploadDocumentAction = defineAction({
  action: "document.upload",
  input: uploadFormSchema,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const id = await uploadDocument(getDb(), getStorage(), actor, {
      personId: input.personId,
      kind: input.kind,
      expiresAt: input.expiresAt,
      fileName: input.file.name,
      bytes: new Uint8Array(await input.file.arrayBuffer()),
    });
    refresh();
    return { id };
  },
});

/** Archive (never delete), for the accounts holding `document.upload` on the owner. */
export const archiveDocumentAction = defineAction({
  action: "document.upload",
  input: z.object({ documentId: z.string().min(1).max(40) }),
  resource: async (input) => {
    const owner = await documentOwner(getDb(), input.documentId);
    if (!owner) throw new DomainError("INVALID_DATA", "Document introuvable.");
    return personResource(owner);
  },
  handler: async ({ input, actor }) => {
    await archiveDocument(getDb(), actor, input.documentId);
    refresh();
    return null;
  },
});
