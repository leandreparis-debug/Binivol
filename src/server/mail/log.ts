import type { DbOrTx } from "../db";
import { sealMail } from "./sealed";
import type { MailService } from "./types";

/**
 * `log` driver (development, tests, hosted demo): writes the e-mail in
 * `outbound_mails`, encrypted, instead of sending it. TOPAZE reads it in
 * /admin/courriels. Attachments are not kept.
 */
export function logMail(db: DbOrTx, createdById: string | null = null): MailService {
  return {
    driver: "log",
    async send(message) {
      await db.outboundMail.create({
        data: {
          to: message.to,
          subject: message.subject,
          payload: sealMail({ text: message.text, html: message.html }),
          createdById,
        },
      });
    },
  };
}
