import type { DossierLinkMode } from "@/generated/prisma/enums";
import { toParisDay } from "@/lib/dates";
import type { DossierDraft } from "@/lib/dossierSchema";
import { withAudit, type Actor as AuditActor } from "../audit";
import { changeStage } from "./candidacies";
import type { Db, DbOrTx } from "../db";
import { ensureDraft, loadDraft, type DraftView } from "../dossier/store";
import { hashDossierToken, looksLikeDossierToken, newDossierToken } from "../dossier/token";
import { DomainError } from "../errors";
import { getMail, MailUnavailableError, type MailService } from "../mail";
import { dossierLinkMail } from "../mail/templates";
import type { Actor } from "../policy/types";
import { dossierSettings } from "../settings";

/**
 * Dossier links (step 7). A link is a random token whose **SHA-256 only** is
 * stored. It opens the candidate's own draft, through a dossier session
 * (`../dossier/session.ts`). It stays usable to resume the draft until the
 * dossier is submitted (`usedAt`), and never after. A new link revokes the
 * previous ones; the draft follows the newest link.
 */

export type LinkState = "active" | "expired" | "used" | "revoked";

export function linkState(
  link: { expiresAt: Date; usedAt: Date | null; revokedAt: Date | null },
  now: Date = new Date(),
): LinkState {
  if (link.revokedAt) return "revoked";
  if (link.usedAt) return "used";
  if (link.expiresAt.getTime() <= now.getTime()) return "expired";
  return "active";
}

const DAY_MS = 86_400_000;
const SYSTEM: AuditActor = { userId: null, label: "Dossier en ligne" };
const auditActor = (actor: Actor) => ({ userId: actor.userId, label: actor.name });

/** Prefill of a new draft: only what Binivol already knows and the candidate gave. */
async function prefill(db: DbOrTx, personId: string): Promise<DossierDraft> {
  const p = await db.person.findUniqueOrThrow({
    where: { id: personId },
    select: { firstName: true, lastName: true, email: true, phone: true },
  });
  return {
    identity: { firstName: p.firstName, lastName: p.lastName },
    contact: { ...(p.email ? { email: p.email } : {}), ...(p.phone ? { phone: p.phone } : {}) },
  };
}

export interface CreatedLink {
  linkId: string;
  /** The token in clear: shown once, never stored. */
  token: string;
  expiresAt: Date;
}

/**
 * Creates a remote link for a person: revokes her active links, creates the
 * new one, attaches her draft to it (created if missing), and moves a
 * CONFIRMED candidacy to FILE through the state machine. One transaction.
 * The caller authorised `dossier.manage`.
 */
export async function createDossierLink(
  db: Db,
  actor: Actor,
  input: { personId: string; days?: number },
  now: Date = new Date(),
): Promise<CreatedLink> {
  const settings = await dossierSettings(db);
  const days = Math.min(Math.max(Math.trunc(input.days ?? settings.linkDays), 1), 30);
  const { token, tokenHash } = newDossierToken();
  const expiresAt = new Date(now.getTime() + days * DAY_MS);
  const linkId = await withAudit(db, auditActor(actor), async (tx, audit) => {
    const revoked = await tx.dossierLink.updateMany({
      where: { personId: input.personId, revokedAt: null, usedAt: null },
      data: { revokedAt: now, updatedById: actor.userId },
    });
    if (revoked.count > 0) {
      audit.log({
        action: "UPDATE",
        entity: "DossierLink",
        field: "revokedAt",
        newValue: { personId: input.personId, revoked: revoked.count, reason: "nouveau lien" },
      });
    }
    const link = await tx.dossierLink.create({
      data: {
        personId: input.personId,
        tokenHash,
        mode: "REMOTE",
        expiresAt,
        createdById: actor.userId,
        updatedById: actor.userId,
      },
    });
    audit.created("DossierLink", link.id, link);
    await ensureDraft(
      tx,
      input.personId,
      link.id,
      await prefill(tx, input.personId),
      auditActor(actor),
    );
    const candidacy = await tx.candidacy.findFirst({
      where: { personId: input.personId, closedAt: null },
      select: { id: true, stage: true },
    });
    if (candidacy?.stage === "CONFIRMED") {
      await changeStage(
        tx,
        actor,
        {
          candidacyId: candidacy.id,
          expectedStage: "CONFIRMED",
          toStage: "FILE",
          note: "Lien de dossier en ligne créé.",
          abandonReason: null,
          nextAction: "Vérifier le dossier envoyé",
          followUpAt: null,
        },
        toParisDay(now),
      );
    }
    return link.id;
  });
  return { linkId, token, expiresAt };
}

/** Revokes a link (never deleted). */
export async function revokeDossierLink(db: Db, actor: Actor, linkId: string): Promise<void> {
  await withAudit(db, auditActor(actor), async (tx, audit) => {
    const { count } = await tx.dossierLink.updateMany({
      where: { id: linkId, revokedAt: null, usedAt: null },
      data: { revokedAt: new Date(), updatedById: actor.userId },
    });
    if (count === 0) throw new DomainError("INVALID_DATA", "Ce lien n'est plus actif.");
    audit.log({
      action: "UPDATE",
      entity: "DossierLink",
      entityId: linkId,
      field: "revokedAt",
      newValue: "révoqué",
    });
  });
}

/** Person of a link (resource of the link actions). */
export async function linkPerson(db: DbOrTx, linkId: string): Promise<string | null> {
  const row = await db.dossierLink.findUnique({
    where: { id: linkId },
    select: { personId: true },
  });
  return row?.personId ?? null;
}

/**
 * E-mails the link to the person (her e-mail on the page). The token comes
 * from the creation dialog and must match the link. The e-mail holds the
 * first name and the link only. SMTP down: clear error, the link stays valid.
 */
export async function sendDossierLink(
  db: Db,
  actor: Actor,
  input: { linkId: string; token: string; baseUrl: string },
  mail: MailService = getMail(db, actor.userId),
): Promise<{ to: string }> {
  const link = await db.dossierLink.findUnique({
    where: { id: input.linkId },
    include: { person: { select: { firstName: true, email: true } } },
  });
  if (link?.mode !== "REMOTE" || link.tokenHash !== hashDossierToken(input.token)) {
    throw new DomainError("INVALID_DATA", "Lien introuvable.");
  }
  if (linkState(link) !== "active")
    throw new DomainError("INVALID_DATA", "Ce lien n'est plus actif.");
  if (!link.person.email) {
    throw new DomainError(
      "INVALID_DATA",
      "Aucun e-mail sur la fiche : copiez le lien pour le transmettre.",
    );
  }
  const { ulName } = await dossierSettings(db);
  const message = dossierLinkMail({
    firstName: link.person.firstName,
    url: `${input.baseUrl.replace(/\/$/, "")}/dossier/${input.token}`,
    ulName,
    expiresAt: link.expiresAt,
  });
  try {
    await mail.send({ to: link.person.email, ...message });
  } catch (error) {
    if (error instanceof MailUnavailableError)
      throw new DomainError("INVALID_DATA", error.message, { cause: error });
    throw error;
  }
  await withAudit(db, auditActor(actor), (_tx, audit) => {
    audit.log({
      action: "UPDATE",
      entity: "DossierLink",
      entityId: link.id,
      field: "sentByMail",
      newValue: mail.driver,
    });
    return Promise.resolve();
  });
  return { to: link.person.email };
}

export type OpenOutcome = { ok: true; linkId: string } | { ok: false };

/**
 * Checks a token from `/dossier/[token]`. Refused (unknown, expired, revoked,
 * used) → `{ ok: false }` without saying which, and the attempt is audited
 * without the token.
 */
export async function openDossierLink(
  db: Db,
  token: string,
  now: Date = new Date(),
): Promise<OpenOutcome> {
  const link = looksLikeDossierToken(token)
    ? await db.dossierLink.findUnique({ where: { tokenHash: hashDossierToken(token) } })
    : null;
  const state = link ? linkState(link, now) : "unknown";
  if (link?.mode === "REMOTE" && state === "active") return { ok: true, linkId: link.id };
  await withAudit(db, SYSTEM, (_tx, audit) => {
    audit.log({
      action: "LOGIN_DENIED",
      entity: "DossierLink",
      entityId: link?.id ?? null,
      field: "open",
      newValue: { reason: link ? state : "inconnu" },
    });
    return Promise.resolve();
  });
  return { ok: false };
}

export interface DossierSessionContext {
  linkId: string;
  personId: string;
  mode: DossierLinkMode;
  draft: DraftView;
}

/**
 * The candidate's context behind a dossier session: the link must still be
 * active (not revoked, not used, not expired), and its draft exists.
 */
export async function resolveDossierLink(
  db: DbOrTx,
  linkId: string,
  now: Date = new Date(),
): Promise<DossierSessionContext | null> {
  const link = await db.dossierLink.findUnique({ where: { id: linkId } });
  if (!link || linkState(link, now) !== "active") return null;
  const draft = await loadDraft(db, link.personId);
  if (!draft) return null;
  return { linkId: link.id, personId: link.personId, mode: link.mode, draft };
}

/**
 * On-site mode: an ON_SITE link (its token is thrown away, it can never be
 * opened remotely), reused while active, carrying the person's draft.
 */
export async function openOnSite(db: Db, actor: Actor, personId: string): Promise<string> {
  return withAudit(db, auditActor(actor), async (tx, audit) => {
    const existing = await tx.dossierLink.findFirst({
      where: {
        personId,
        mode: "ON_SITE",
        revokedAt: null,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    const link =
      existing ??
      (await tx.dossierLink.create({
        data: {
          personId,
          tokenHash: newDossierToken().tokenHash,
          mode: "ON_SITE",
          expiresAt: new Date(Date.now() + DAY_MS),
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      }));
    if (!existing) audit.created("DossierLink", link.id, link);
    await ensureDraft(tx, personId, link.id, await prefill(tx, personId), auditActor(actor));
    return link.id;
  });
}

export interface DossierLinkView {
  id: string;
  mode: DossierLinkMode;
  state: LinkState;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

/** Links of a person, newest first (Intégration tab). */
export async function dossierLinks(
  db: DbOrTx,
  personId: string,
  now: Date = new Date(),
): Promise<DossierLinkView[]> {
  const rows = await db.dossierLink.findMany({
    where: { personId },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      mode: true,
      createdAt: true,
      expiresAt: true,
      usedAt: true,
      revokedAt: true,
    },
  });
  return rows.map((r) => ({ ...r, state: linkState(r, now) }));
}
