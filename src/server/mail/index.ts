import { getEnv } from "@/lib/env";
import type { DbOrTx } from "../db";
import { logMail } from "./log";
import { smtpMail } from "./smtp";
import type { MailService } from "./types";

export * from "./types";
export { logMail } from "./log";
export { smtpMail } from "./smtp";
export { openMail } from "./sealed";

/** The configured mail service (`MAIL_DRIVER`, `log` by default). */
export function getMail(db: DbOrTx, createdById: string | null = null): MailService {
  const env = getEnv();
  if (env.MAIL_DRIVER === "smtp") {
    return smtpMail({
      host: env.SMTP_HOST ?? "",
      port: env.SMTP_PORT,
      user: env.SMTP_USER,
      password: env.SMTP_PASSWORD,
      from: env.SMTP_FROM ?? "",
    });
  }
  return logMail(db, createdById);
}
