"use server";

import { attachmentFormInput, removeAttachmentInput, saveDossierInput } from "@/lib/dossierForms";
import { definePublicAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { requireCandidate } from "@/server/dossier/current";
import {
  addDossierFormAttachment,
  formActor,
  removeDossierFormAttachment,
  saveDossierForm,
  submitDossierForm,
} from "@/server/services/dossierForm";
import { getStorage } from "@/server/storage";

/*
 * The candidate's actions (no responsible session). Each one resolves the
 * dossier cookie (`requireCandidate`: link still active, cookie renewed);
 * the person and the draft come from the link, never from the input.
 */

export const saveDossierAction = definePublicAction({
  input: saveDossierInput,
  handler: async ({ input }) => {
    const context = await requireCandidate(getDb());
    return saveDossierForm(getDb(), context, input.data, formActor(context));
  },
});

export const addDossierAttachmentAction = definePublicAction({
  input: attachmentFormInput,
  handler: async ({ input }) => {
    const context = await requireCandidate(getDb());
    return addDossierFormAttachment(getDb(), getStorage(), context, input, formActor(context));
  },
});

export const removeDossierAttachmentAction = definePublicAction({
  input: removeAttachmentInput,
  handler: async ({ input }) => {
    const context = await requireCandidate(getDb());
    return removeDossierFormAttachment(getDb(), context, input.attachmentId, formActor(context));
  },
});

export const submitDossierAction = definePublicAction({
  input: saveDossierInput,
  handler: async ({ input }) => {
    const context = await requireCandidate(getDb());
    return submitDossierForm(getDb(), context, input.data, formActor(context));
  },
});
