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

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

function htmlOf(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * The signature code (step 8). **Only the code and the first name**, in the
 * tone of the local unit's e-mails (tutoiement, no em dash).
 */
export function signatureCodeMail(input: {
  firstName: string;
  code: string;
  ulName: string;
  /** The legal guardian signs the dossier of a minor. */
  forGuardian?: boolean;
}): { subject: string; text: string; html: string } {
  const subject = "Ton code de signature";
  const text = [
    `Bonjour ${input.firstName},`,
    "",
    input.forGuardian
      ? "Voici ton code pour signer le dossier de bénévole, en tant que représentant légal :"
      : "Voici ton code pour signer ton dossier de bénévole :",
    "",
    input.code,
    "",
    "Il est valable 10 minutes. Si tu n'as rien demandé, ignore simplement ce message.",
    "",
    input.ulName,
    "Croix-Rouge française",
  ].join("\n");
  return { subject, text, html: htmlOf(text) };
}

/** Default text of the e-mail of the signed documents (setting `VOLUNTEER_DOSSIER_MAIL`). */
export const DEFAULT_SIGNED_DOSSIER_MAIL = {
  subject: "Ton dossier de bénévole est complet",
  body: [
    "Bonjour {prenom},",
    "",
    "Bonne nouvelle : ton dossier de bénévole est complet. Il est signé par toi et par l'unité locale. Bienvenue parmi nous !",
    "",
    "Et maintenant ? Nous créons ton compte Croix-Rouge et ton NIVOL, ton identifiant de bénévole. Tu reçois un message dès qu'ils sont prêts.",
    "",
    "Tu trouveras en pièces jointes :",
    "{pieces}",
    "",
    "Garde-les bien. Pour toute question, réponds simplement à ce message.",
    "",
    "À très vite,",
    "{structure}",
    "Croix-Rouge française",
  ].join("\n"),
};

/**
 * The e-mail sent with the signed documents. The text comes from the setting
 * (`{prenom}`, `{structure}`, `{pieces}` are replaced); no em dash is ever sent.
 */
export function signedDossierMail(input: {
  template: { subject: string; body: string };
  firstName: string;
  ulName: string;
  attachments: string[];
}): { subject: string; text: string; html: string } {
  const pieces = input.attachments.map((name) => `- ${name}`).join("\n");
  const fill = (s: string) =>
    s
      .replaceAll("{prenom}", input.firstName)
      .replaceAll("{structure}", input.ulName)
      .replaceAll("{pieces}", pieces)
      .replaceAll("—", ",");
  const text = fill(input.template.body);
  return { subject: fill(input.template.subject), text, html: htmlOf(text) };
}
