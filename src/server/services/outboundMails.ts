import type { DbOrTx } from "../db";
import { openMail } from "../mail";
import { authorize } from "../policy/can";
import type { Actor } from "../policy/types";

export interface AttachmentInfo {
  filename: string;
  size: number;
}

export interface OutboundMailView {
  id: string;
  to: string;
  subject: string;
  text: string | null;
  createdAt: Date;
  createdBy: string | null;
  /** Attachments by name and size (the files themselves are not kept). */
  attachments: AttachmentInfo[];
}

function attachmentList(value: unknown): { filename: string; size: number }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((a: unknown) => {
    if (typeof a !== "object" || a === null) return [];
    const { filename, size } = a as { filename?: unknown; size?: unknown };
    return typeof filename === "string" && typeof size === "number" ? [{ filename, size }] : [];
  });
}

/**
 * The e-mails kept by the `log` driver (TOPAZE, `mail.log.read`), newest
 * first, decrypted for display. Testing tool: with `smtp`, nothing is kept.
 *
 * @throws {ForbiddenError}
 */
export async function listOutboundMails(
  db: DbOrTx,
  actor: Actor,
  limit = 50,
): Promise<OutboundMailView[]> {
  authorize(actor, "mail.log.read");
  const rows = await db.outboundMail.findMany({ orderBy: { createdAt: "desc" }, take: limit });
  const authorIds = [...new Set(rows.map((r) => r.createdById).filter((v) => v !== null))];
  const authors = new Map(
    (
      await db.user.findMany({ where: { id: { in: authorIds } }, select: { id: true, name: true } })
    ).map((u) => [u.id, u.name]),
  );
  return rows.map((r) => ({
    id: r.id,
    to: r.to,
    subject: r.subject,
    text: openMail(r.payload)?.text ?? null,
    createdAt: r.createdAt,
    createdBy: r.createdById ? (authors.get(r.createdById) ?? null) : null,
    attachments: attachmentList(r.attachments),
  }));
}
