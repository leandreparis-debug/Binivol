"use server";

import {
  attachmentFormInput,
  openDossierInput,
  removeAttachmentInput,
  saveDossierInput,
} from "@/lib/dossierForms";
import { pngFromDataUrl, requestCodeInput, signWithCodeInput } from "@/lib/signatureForms";
import { definePublicAction } from "@/server/actions/defineAction";
import { getDb } from "@/server/db";
import {
  clearDossierCookie,
  requireCandidate,
  requireSigningCandidate,
  setDossierCookie,
} from "@/server/dossier/current";
import { requestMeta } from "@/server/signature/request";
import { requestSignatureCode, signWithCode } from "@/server/signature/service";
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
 * Exchange of a link token (read from the fragment of `/dossier/ouvrir`) for
 * the dossier cookie. A refused token gets `{ opened: false }`, whatever the
 * reason (audited without the token).
 */
export const openDossierAction = definePublicAction({
  input: openDossierInput,
  handler: async ({ input }) => {
    const outcome = await openDossierLink(getDb(), input.token);
    if (outcome.ok) await setDossierCookie(outcome.linkId);
    else await clearDossierCookie();
    return { opened: outcome.ok };
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

/** E-mails a signature code to the next signer (the candidate, then her legal guardian). */
export const requestSignatureCodeAction = definePublicAction({
  input: requestCodeInput,
  handler: async ({ input }) => {
    const { personId } = await requireSigningCandidate(getDb());
    const sent = await requestSignatureCode(getDb(), { personId, role: input.role });
    return { sentTo: sent.sentTo, expiresAt: sent.expiresAt.toISOString() };
  },
});

/** Signs with the trace (or typed name) and the code; the person comes from the cookie. */
export const signDossierAction = definePublicAction({
  input: signWithCodeInput,
  handler: async ({ input }) => {
    const { personId, linkId } = await requireSigningCandidate(getDb());
    const view = await signWithCode(
      getDb(),
      getStorage(),
      {
        personId,
        linkId,
        role: input.role,
        inputKind: input.inputKind,
        png: pngFromDataUrl(input.image),
        code: input.code,
      },
      await requestMeta(),
    );
    return { next: view.next };
  },
});
