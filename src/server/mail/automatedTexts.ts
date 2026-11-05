import { formatDate } from "@/lib/dates";

/**
 * Texts of the automatic e-mails (step 12). Pure. House rules, checked by
 * the tests: tutoiement, **never an age**, no em dash, no sensitive value
 * (no B3 outcome, no birth date, no address).
 */

export interface MailText {
  subject: string;
  text: string;
  html: string;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${String(c.charCodeAt(0))};`);

/** Plain text → HTML paragraphs (blank line = new paragraph). */
export function toHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${block.split("\n").map(escape).join("<br>")}</p>`)
    .join("\n");
}

function mail(subject: string, text: string): MailText {
  const clean = (s: string) => s.replace(/—/g, ":");
  return { subject: clean(subject), text: clean(text), html: toHtml(clean(text)) };
}

/** Replaces `{key}` placeholders; unknown ones are left as they are. */
export function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (all, key: string) => values[key] ?? all);
}

export interface DigestLine {
  priority: string;
  subject: string;
  label: string;
  message: string;
}

/** Summary of the alerts of one responsible. */
export function digestMail(input: {
  name: string;
  counts: { label: string; count: number }[];
  lines: DigestLine[];
  total: number;
  appUrl: string;
}): MailText {
  const shown = input.lines.length;
  const text = [
    `Bonjour ${input.name},`,
    "",
    `Voici le récapitulatif des alertes de ton périmètre : ${String(input.total)} au total.`,
    input.counts.map((c) => `${c.label} : ${String(c.count)}`).join("\n"),
    "",
    input.lines.map((l) => `[${l.priority}] ${l.subject} : ${l.label}. ${l.message}`).join("\n"),
    ...(input.total > shown
      ? ["", `Et ${String(input.total - shown)} autres, à voir dans Binivol.`]
      : []),
    "",
    `Pour corriger : ${input.appUrl}/alertes`,
    "",
    "Binivol",
  ].join("\n");
  return mail(`Binivol : ${String(input.total)} alertes à regarder`, text);
}

/** Prévenance du pôle Urgence: one e-mail for a whole group entry. */
export function urgenceNoticeMail(input: {
  code: string;
  label: string;
  result: "PASSED" | "REGISTERED";
  date: Date | null;
  people: string[];
  author: string;
}): MailText {
  const what = input.result === "PASSED" ? "validée" : "inscrite";
  const when = input.date ? ` du ${formatDate(input.date)}` : "";
  const text = [
    "Bonjour,",
    "",
    `Une session ${input.code}${when} vient d'être ${what} dans Binivol (${input.label}).`,
    `Personnes concernées (${String(input.people.length)}) :`,
    input.people.map((p) => `- ${p}`).join("\n"),
    "",
    `Saisie par ${input.author}.`,
    "",
    "Binivol",
  ].join("\n");
  return mail(`${input.code} : session ${what} (${String(input.people.length)})`, text);
}

/** « Récapitulatif TCAU »: everyone with their state for the listed codes. */
export function urgenceSummaryMail(input: {
  codes: string[];
  rows: { name: string; states: string[] }[];
  author: string;
  day: Date;
}): MailText {
  const text = [
    "Bonjour,",
    "",
    `Voici l'état ${input.codes.join(", ")} des bénévoles au ${formatDate(input.day)} :`,
    input.rows.map((r) => `- ${r.name} : ${r.states.join(", ")}`).join("\n"),
    "",
    `Envoyé par ${input.author}.`,
    "",
    "Binivol",
  ].join("\n");
  return mail(`Récapitulatif ${input.codes.join(", ")} au ${formatDate(input.day)}`, text);
}

/** Birthday: the configured text, never the age. */
export function birthdayMail(input: {
  firstName: string;
  template: string;
  ulName: string;
}): MailText {
  const text = fillTemplate(input.template, { prenom: input.firstName, ul: input.ulName });
  return mail("Joyeux anniversaire !", text);
}

/** Anniversary of the engagement: number of years of engagement, never the age. */
export function anniversaryMail(input: {
  firstName: string;
  years: number;
  template: string;
  ulName: string;
}): MailText {
  const text = fillTemplate(input.template, {
    prenom: input.firstName,
    annees: String(input.years),
    ul: input.ulName,
  });
  return mail(
    `${String(input.years)} an${input.years > 1 ? "s" : ""} d'engagement : merci !`,
    text,
  );
}

/**
 * Reminder of an unsigned dossier. The link is **not** in it (the token is
 * never stored): the candidate asks for a new one, or DIAMANT sends it.
 */
export function dossierReminderMail(input: {
  firstName: string;
  ulName: string;
  sentAt: Date;
}): MailText {
  const text = [
    `Bonjour ${input.firstName},`,
    "",
    `Le ${formatDate(input.sentAt)}, nous t'avons envoyé le lien de ton dossier de bénévole. Il n'est pas encore signé.`,
    "Tu peux reprendre le dossier avec le lien reçu. S'il ne fonctionne plus ou si tu ne le retrouves pas, réponds simplement à ce message : nous t'en enverrons un nouveau.",
    "",
    "À très vite,",
    input.ulName,
    "Croix-Rouge française",
  ].join("\n");
  return mail(`${input.ulName} : ton dossier de bénévole t'attend`, text);
}
