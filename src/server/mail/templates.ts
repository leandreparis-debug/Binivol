/**
 * The e-mail of a dossier link: the first name, the link, a plain text signed
 * by the local unit. **No other personal data.**
 */
export function dossierLinkMail(input: {
  firstName: string;
  url: string;
  ulName: string;
  expiresAt: Date;
}): { subject: string; text: string; html: string } {
  const until = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(input.expiresAt);
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
  const subject = `${input.ulName} : votre dossier bénévole`;
  const text = [
    `Bonjour ${input.firstName},`,
    "",
    "Merci pour votre engagement. Pour compléter votre dossier bénévole, ouvrez ce lien personnel :",
    input.url,
    "",
    `Le lien est valable jusqu'au ${until}. Vous pouvez remplir le dossier en plusieurs fois.`,
    "Ne transférez pas ce message : le lien ouvre votre dossier.",
    "",
    input.ulName,
    "Croix-Rouge française",
  ].join("\n");
  const html = `<p>Bonjour ${escape(input.firstName)},</p>
<p>Merci pour votre engagement. Pour compléter votre dossier bénévole, ouvrez ce lien personnel :</p>
<p><a href="${escape(input.url)}">Compléter mon dossier</a></p>
<p>Le lien est valable jusqu'au ${until}. Vous pouvez remplir le dossier en plusieurs fois.<br>Ne transférez pas ce message : le lien ouvre votre dossier.</p>
<p>${escape(input.ulName)}<br>Croix-Rouge française</p>`;
  return { subject, text, html };
}

/**
 * The e-mail of a signature code: the first name and the code, nothing else
 * (no name of the dossier, no link). Tone of the UL: « tu », no long dash.
 */
export function signatureCodeMail(input: { firstName: string; code: string; ulName: string }): {
  subject: string;
  text: string;
  html: string;
} {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
  const subject = `Ton code de signature : ${input.code}`;
  const text = [
    `Bonjour ${input.firstName},`,
    "",
    `Voici ton code pour signer : ${input.code}`,
    "",
    "Il est valable 10 minutes. Si tu n'as rien demandé, ignore simplement ce message.",
    "",
    input.ulName,
    "Croix-Rouge française",
  ].join("\n");
  const html = `<p>Bonjour ${escape(input.firstName)},</p>
<p>Voici ton code pour signer : <strong style="font-size:20px;letter-spacing:2px">${escape(input.code)}</strong></p>
<p>Il est valable 10 minutes. Si tu n'as rien demandé, ignore simplement ce message.</p>
<p>${escape(input.ulName)}<br>Croix-Rouge française</p>`;
  return { subject, text, html };
}

/**
 * The e-mail of the final documents, from the `FINAL_MAIL_TEXT` setting:
 * `{prenom}`, `{pieces}` (one line per attachment) and `{ul}` are replaced.
 */
export function finalDocumentsMail(input: {
  template: string;
  firstName: string;
  ulName: string;
  attachments: string[];
}): { subject: string; text: string; html: string } {
  const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);
  const pieces = input.attachments.map((a) => `- ${a}`).join("\n");
  const text = input.template
    .replaceAll("{prenom}", input.firstName)
    .replaceAll("{ul}", input.ulName)
    .replaceAll("{pieces}", pieces);
  const html = text
    .split(/\n{2,}/)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  return { subject: `${input.ulName} : ton dossier de bénévole est complet`, text, html };
}
