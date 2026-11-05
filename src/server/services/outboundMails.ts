import type { DbOrTx } from "../db";
import { openMail } from "../mail";
import { authorize } from "../policy/can";
import type { Actor } from "../policy/types";

export interface OutboundMailView {
  id: string;
  to: string;
  subject: string;
  text: string | null;
  createdAt: Date;
  createdBy: string | null;
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
  }));
}
