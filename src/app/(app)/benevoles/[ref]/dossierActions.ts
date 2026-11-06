"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toParisDay } from "@/lib/dates";
import { attachmentFormInput, removeAttachmentInput, saveDossierInput } from "@/lib/dossierForms";
import { defineAction } from "@/server/actions/defineAction";
import { appBaseUrl } from "@/server/baseUrl";
import { REPORT_KEYS, type ReportKey } from "@/server/dossier/compare";
import { countersignInput, requestCodeInput, signFormInput } from "@/lib/signatureForms";
import { countersign, resendFinalMail, signatureStatus } from "@/server/dossier/signing";
import { applyDossier, readDossierForReview, submissionToSign } from "@/server/dossier/store";
import { getMail } from "@/server/mail";
import { requestSignatureCode, submitSignature } from "@/server/services/signatureForm";
import { dossierLinkUrl } from "@/server/dossier/token";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
import { addressQuerySchema, suggestForDossier } from "@/server/geo/suggest";
import { loadPersonFacts } from "@/server/policy/facts";
import type { Actor, PolicyResource } from "@/server/policy/types";
import {
  addDossierFormAttachment,
  formActor,
  onSiteContext,
  removeDossierFormAttachment,
  saveDossierForm,
  submitDossierForm,
} from "@/server/services/dossierForm";
import {
  createDossierLink,
  linkPerson,
  openOnSite,
  revokeDossierLink,
  sendDossierLink,
} from "@/server/services/dossiers";
import { getStorage } from "@/server/storage";

/*
 * The responsible's dossier actions (`dossier.manage` on the person): links,
 * on-site mode, review and report.
 */

const id = z.string().min(1).max(40);

async function personResource(personId: string | undefined): Promise<PolicyResource> {
  if (!personId) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  const facts = await loadPersonFacts(getDb(), personId, toParisDay());
  if (!facts) throw new DomainError("INVALID_DATA", "Personne introuvable.");
  return { person: facts };
}

async function linkResource(linkId: string): Promise<PolicyResource> {
  const personId = await linkPerson(getDb(), linkId);
  if (!personId) throw new DomainError("INVALID_DATA", "Lien introuvable.");
  return personResource(personId);
}

const refresh = () => {
  revalidatePath("/benevoles/[ref]", "page");
};

export const createDossierLinkAction = defineAction({
  action: "dossier.manage",
  input: z.object({ personId: id, days: z.coerce.number().int().min(1).max(30) }),
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const created = await createDossierLink(getDb(), actor, input);
    refresh();
    // The token is returned once, to this dialog; it is stored nowhere in clear.
    return {
      linkId: created.linkId,
      token: created.token,
      url: dossierLinkUrl(await appBaseUrl(), created.token),
      expiresAt: created.expiresAt.toISOString(),
    };
  },
});

export const sendDossierLinkAction = defineAction({
  action: "dossier.manage",
  input: z.object({ linkId: id, token: z.string().min(1).max(100) }),
  resource: (input) => linkResource(input.linkId),
  handler: async ({ input, actor }) => {
    const sent = await sendDossierLink(getDb(), actor, { ...input, baseUrl: await appBaseUrl() });
    return sent;
  },
});

export const revokeDossierLinkAction = defineAction({
  action: "dossier.manage",
  input: z.object({ linkId: id }),
  resource: (input) => linkResource(input.linkId),
  handler: async ({ input, actor }) => {
    await revokeDossierLink(getDb(), actor, input.linkId);
    refresh();
    return null;
  },
});

export const openOnSiteAction = defineAction({
  action: "dossier.manage",
  input: z.object({ personId: id }),
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    await openOnSite(getDb(), actor, input.personId);
    return null;
  },
});

/** The review table (journaled consultation: SENSITIVE_VIEW, context « dossier »). */
export const readDossierReviewAction = defineAction({
  action: "dossier.manage",
  input: z.object({ personId: id }),
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const { person } = await personResource(input.personId);
    if (!person) throw new DomainError("INVALID_DATA", "Personne introuvable.");
    const review = await readDossierForReview(getDb(), actor, input.personId, person);
    if (!review) throw new DomainError("INVALID_DATA", "Aucun dossier envoyé pour cette personne.");
    return review;
  },
});

const reportKey = z.enum(REPORT_KEYS as [ReportKey, ...ReportKey[]]);

export const applyDossierAction = defineAction({
  action: "dossier.manage",
  input: z.object({ personId: id, submissionId: id, keys: z.array(reportKey).max(64) }),
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    if (input.keys.length === 0) {
      throw new DomainError("INVALID_DATA", "Cochez au moins un champ à reporter.");
    }
    const written = await applyDossier(getDb(), actor, input);
    refresh();
    return { written };
  },
});

// --- On-site mode: the form's actions, on the responsible's session ----------

async function onSite(personId: string | undefined, actor: Actor) {
  const context = personId ? await onSiteContext(getDb(), personId) : null;
  if (!context) {
    throw new DomainError(
      "DOSSIER_SESSION_EXPIRED",
      "Le mode sur place n'est plus ouvert pour cette personne. Rouvrez-le depuis l'onglet Intégration.",
    );
  }
  return { context, audit: formActor(context, actor) };
}

/** On-site mode: address suggestions (step 16), the same service as the candidate's route. */
export const suggestOnSiteAddressAction = defineAction({
  action: "dossier.manage",
  input: addressQuerySchema.extend({ personId: z.string().min(1).max(40) }),
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const { context } = await onSite(input.personId, actor);
    return suggestForDossier(getDb(), context.linkId, { kind: input.kind, q: input.q });
  },
});

export const saveOnSiteDossierAction = defineAction({
  action: "dossier.manage",
  input: saveDossierInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const { context, audit } = await onSite(input.personId, actor);
    return saveDossierForm(getDb(), context, input.data, audit);
  },
});

export const addOnSiteAttachmentAction = defineAction({
  action: "dossier.manage",
  input: attachmentFormInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const { context, audit } = await onSite(input.personId, actor);
    return addDossierFormAttachment(getDb(), getStorage(), context, input, audit);
  },
});

export const removeOnSiteAttachmentAction = defineAction({
  action: "dossier.manage",
  input: removeAttachmentInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const { context, audit } = await onSite(input.personId, actor);
    return removeDossierFormAttachment(getDb(), context, input.attachmentId, audit);
  },
});

export const submitOnSiteDossierAction = defineAction({
  action: "dossier.manage",
  input: saveDossierInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const { context, audit } = await onSite(input.personId, actor);
    const result = await submitDossierForm(getDb(), context, input.data, audit);
    refresh();
    return result;
  },
});

// --- Signature (step 8) ---------------------------------------------------

async function toSign(personId: string | undefined): Promise<string> {
  const found = personId ? await submissionToSign(getDb(), personId) : null;
  if (!found) {
    throw new DomainError("SIGNATURE_STATE", "Aucun dossier à signer pour cette personne.");
  }
  return found.submissionId;
}

/** On site: the code of the next signer, sent to her own e-mail. */
export const requestOnSiteCodeAction = defineAction({
  action: "dossier.manage",
  input: requestCodeInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input }) =>
    requestSignatureCode(getDb(), await toSign(input.personId), input.role),
});

/** On site: signature, with the code or with the identity checked in person. */
export const signOnSiteAction = defineAction({
  action: "dossier.manage",
  input: signFormInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const state = await submitSignature(getDb(), await toSign(input.personId), input, actor);
    refresh();
    return state;
  },
});

/** Countersignature of the charte, then documents, proof, e-mail and GAIA. */
export const countersignAction = defineAction({
  action: "dossier.manage",
  input: countersignInput,
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const status = await signatureStatus(getDb(), input.personId);
    if (!status) throw new DomainError("SIGNATURE_STATE", "Aucun dossier à contresigner.");
    const result = await countersign(getDb(), getStorage(), getMail(getDb(), actor.userId), actor, {
      submissionId: status.submissionId,
      quality: input.quality,
      signature:
        input.kind === "drawn" && input.png
          ? { kind: "drawn", png: new Uint8Array(await input.png.arrayBuffer()) }
          : { kind: "typed", name: input.typedName ?? "" },
    });
    refresh();
    return { mailSent: result.mailSent, mailError: result.mailError };
  },
});

/** « Renvoyer l'e-mail » of the final documents (the stored UL copy). */
export const resendFinalMailAction = defineAction({
  action: "dossier.manage",
  input: z.object({ personId: id }),
  resource: (input) => personResource(input.personId),
  handler: async ({ input, actor }) => {
    const status = await signatureStatus(getDb(), input.personId);
    if (status?.status !== "COMPLETE") {
      throw new DomainError("SIGNATURE_STATE", "Le dossier n'est pas encore complet.");
    }
    const result = await resendFinalMail(
      getDb(),
      getStorage(),
      getMail(getDb(), actor.userId),
      actor,
      status.submissionId,
    );
    refresh();
    return result;
  },
});
