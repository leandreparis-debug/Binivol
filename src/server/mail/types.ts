/**
 * Sending e-mails behind one interface, so the application moves from a test
 * SMTP relay (Brevo) to the VPS relay by configuration only (`MAIL_DRIVER`).
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: Buffer; contentType: string }[];
}

export interface MailService {
  readonly driver: "smtp" | "log";
  send(message: MailMessage): Promise<void>;
}

/** Sending failed (relay down, refused). The message is safe to show. */
export class MailUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(
      "L'e-mail n'a pas pu être envoyé pour le moment. Le lien reste valable : copiez-le pour le transmettre.",
      options,
    );
    this.name = "MailUnavailableError";
  }
}
