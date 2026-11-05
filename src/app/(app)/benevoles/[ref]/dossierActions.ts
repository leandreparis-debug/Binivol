"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { toParisDay } from "@/lib/dates";
import { attachmentFormInput, removeAttachmentInput, saveDossierInput } from "@/lib/dossierForms";
import { defineAction } from "@/server/actions/defineAction";
import { appBaseUrl } from "@/server/baseUrl";
import { REPORT_KEYS, type ReportKey } from "@/server/dossier/compare";
import { applyDossier, readDossierForReview } from "@/server/dossier/store";
import { dossierOpenUrl } from "@/server/dossier/token";
import { getDb } from "@/server/db";
import { DomainError } from "@/server/errors";
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
      url: dossierOpenUrl(await appBaseUrl(), created.token),
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
