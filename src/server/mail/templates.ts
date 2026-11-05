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
