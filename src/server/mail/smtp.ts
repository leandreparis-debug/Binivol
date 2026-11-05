import nodemailer from "nodemailer";
import { MailUnavailableError, type MailService } from "./types";

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  password?: string;
  from: string;
}

/** `smtp` driver (Nodemailer): Brevo in test, the VPS relay later. TLS on port 465, STARTTLS otherwise. */
export function smtpMail(config: SmtpConfig): MailService {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
  });
  return {
    driver: "smtp",
    async send(message) {
      try {
        await transport.sendMail({
          from: config.from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
          attachments: message.attachments,
        });
      } catch (error) {
        throw new MailUnavailableError({ cause: error });
      }
    },
  };
}
