import type { DiplomaCatalogItem } from "@/lib/diplomas";
import { toParisDay } from "@/lib/dates";
import { getEnv, isHostedDemo } from "@/lib/env";
import type { DossierAttachmentKind } from "@/lib/dossierForms";
import type { DossierDraft, DossierIssue } from "@/lib/dossierSchema";
import type { Actor as AuditActor } from "../audit";
import type { Db } from "../db";
import {
  addAttachment,
  CANDIDATE_ACTOR,
  removeAttachment,
  saveDraft,
  submitDraft,
  type DraftAttachment,
} from "../dossier/store";
import type { Actor } from "../policy/types";
import { dossierSettings } from "../settings";
import type { StorageService } from "../storage";
import { resolveDossierLink, type DossierSessionContext } from "./dossiers";

/**
 * What the dossier form does, for both entry points: the candidate's remote
 * session (`/dossier`) and the on-site mode (a responsible's session, on the
 * responsible's device). The caller resolved the context; this module never
 * reads a cookie nor a token.
 */

/** Audit actor: the candidate, or the responsible holding the on-site device. */
export function formActor(context: DossierSessionContext, responsible?: Actor): AuditActor {
  if (context.mode === "ON_SITE" && responsible) {
    return { userId: responsible.userId, label: `${responsible.name} (sur place)` };
  }
  return CANDIDATE_ACTOR;
}

/** The ON_SITE link of a person, while active, with its draft. */
export async function onSiteContext(
  db: Db,
  personId: string,
  now = new Date(),
): Promise<DossierSessionContext | null> {
  const link = await db.dossierLink.findFirst({
    where: {
      personId,
      mode: "ON_SITE",
      revokedAt: null,
      usedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return link ? resolveDossierLink(db, link.id, now) : null;
}

export interface FormAttachment {
  id: string;
  kind: string;
  fileName: string;
  sizeBytes: number;
}

export interface DossierFormView {
  mode: DossierSessionContext["mode"];
  data: DossierDraft;
  warnings: string[];
  attachments: FormAttachment[];
  /** Today in Paris (AAAA-MM-JJ): the age shown is computed on it. */
  today: string;
  savedAt: string;
  ulName: string;
  rgpdNotice: string;
  /** Diplomas offered in the Profil step (setting `DECLARED_DIPLOMA_CATALOG`). */
  diplomaCatalog: readonly DiplomaCatalogItem[];
  /** False on a hosted demo without document storage (ADR-035): the step says so upfront. */
  attachmentsEnabled: boolean;
}

export async function dossierFormView(
  db: Db,
  context: DossierSessionContext,
): Promise<DossierFormView> {
  const { ulName, rgpdNotice, diplomaCatalog } = await dossierSettings(db);
  return {
    mode: context.mode,
    data: context.draft.data,
    warnings: context.draft.warnings,
    attachments: context.draft.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      fileName: a.fileName,
      sizeBytes: a.sizeBytes,
    })),
    today: toParisDay().toISOString().slice(0, 10),
    savedAt: context.draft.updatedAt.toISOString(),
    ulName,
    attachmentsEnabled: !(isHostedDemo() && getEnv().STORAGE_DRIVER === "local"),
    rgpdNotice,
    diplomaCatalog,
  };
}

export async function saveDossierForm(
  db: Db,
  context: DossierSessionContext,
  data: DossierDraft,
  actor: AuditActor,
): Promise<{ savedAt: string }> {
  const savedAt = await saveDraft(db, context.draft.submissionId, data, actor);
  return { savedAt: savedAt.toISOString() };
}

export async function addDossierFormAttachment(
  db: Db,
  storage: StorageService,
  context: DossierSessionContext,
  input: { kind: DossierAttachmentKind; file: File },
  actor: AuditActor,
): Promise<Pick<DraftAttachment, "id" | "kind" | "fileName" | "sizeBytes">> {
  const row = await addAttachment(
    db,
    storage,
    {
      submissionId: context.draft.submissionId,
      kind: input.kind,
      fileName: input.file.name,
      bytes: new Uint8Array(await input.file.arrayBuffer()),
    },
    actor,
  );
  return { id: row.id, kind: row.kind, fileName: row.fileName, sizeBytes: row.sizeBytes };
}

export async function removeDossierFormAttachment(
  db: Db,
  context: DossierSessionContext,
  attachmentId: string,
  actor: AuditActor,
): Promise<null> {
  await removeAttachment(db, { submissionId: context.draft.submissionId, attachmentId }, actor);
  return null;
}

export type DossierSubmitResult =
  { submitted: true } | { submitted: false; issues: DossierIssue[] };

/** Saves what is on the screen, then submits (complete rules, on today's date in Paris). */
export async function submitDossierForm(
  db: Db,
  context: DossierSessionContext,
  data: DossierDraft,
  actor: AuditActor,
): Promise<DossierSubmitResult> {
  await saveDraft(db, context.draft.submissionId, data, actor);
  const { ulName } = await dossierSettings(db);
  const outcome = await submitDraft(
    db,
    { submissionId: context.draft.submissionId, day: toParisDay(), structure: ulName },
    actor,
  );
  return outcome.ok ? { submitted: true } : { submitted: false, issues: outcome.issues };
}
