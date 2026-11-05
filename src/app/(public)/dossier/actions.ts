"use server";

import { z } from "zod";
import { attachmentFormInput, removeAttachmentInput, saveDossierInput } from "@/lib/dossierForms";
import { definePublicAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import { requireCandidate, setDossierCookie } from "@/server/dossier/current";
import {
  addDossierFormAttachment,
  formActor,
  removeDossierFormAttachment,
  saveDossierForm,
  submitDossierForm,
} from "@/server/services/dossierForm";
import { openDossierLink } from "@/server/services/dossiers";
import { getStorage } from "@/server/storage";

/*
 * The candidate's actions (no responsible session). Each one resolves the
 * dossier cookie (`requireCandidate`: link still active, cookie renewed);
 * the person and the draft come from the link, never from the input.
 */

/**
 * Exchange of the link token (read by `/dossier/ouvrir` from the address
 * fragment, sent in the POST body) for the dossier cookie. The answer never
 * says why a token is refused.
 */
export const openDossierLinkAction = definePublicAction({
  input: z.object({ token: z.string().max(200) }),
  handler: async ({ input }) => {
    const outcome = await openDossierLink(getDb(), input.token);
    if (!outcome.ok) return { ok: false as const };
    await setDossierCookie(outcome.linkId);
    return { ok: true as const };
  },
});

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
