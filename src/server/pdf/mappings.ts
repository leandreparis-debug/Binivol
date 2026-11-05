import type { SignerRole } from "@/generated/prisma/enums";
import type { DossierDraft } from "@/lib/dossierSchema";
import { formatPhone } from "@/lib/phone";
import { isoDayParts, parisDateParts } from "./text";
import type { TemplateKey } from "./templates";

/**
 * Correspondence between the dossier and the AcroForm fields of the three
 * official templates (exact field names, docs/dossier.md). Pure. Every field
 * of a template is either filled here, signed (image), or listed as
 * intentionally empty with its reason: a test checks it against the PDFs.
 *
 * Check boxes are `true` (/Oui) or `false` (/Off).
 */

export type FieldValue = string | boolean;

export interface MappingContext {
  /** The submitted dossier (normalised). */
  data: DossierDraft;
  /** « Structure de rattachement » (setting UL_NAME). */
  ulName: string;
  /** « Fait à » (setting UL_CITY). */
  ulCity: string;
  /** Day of the volunteer's signature (date fields); null for a preview. */
  signedAt: Date | null;
  /** The Croix-Rouge representative who countersigns the charte (null before). */
  crf: { lastName: string; firstName: string; quality: string } | null;
  /** Under 18 on the submission day: the legal guardian signs the charte. */
  minor: boolean;
  /**
   * NIVOL of the person's page, given by Gaia (step 9): written on the
   * aptitude certificate once known. Never the NIVOL declared in the dossier.
   */
  nivol?: string | null;
}

export interface TemplateMapping {
  fields: Record<string, FieldValue>;
  /** Signature field → signer whose image goes in its rectangle. */
  signatures: Record<string, SignerRole>;
  /** Fields left empty on purpose, with the reason. */
  empty: Record<string, string>;
  /**
   * A field drawn twice on the page (one name, two widgets) whose second
   * widget means something else: that widget is detached and receives this
   * text (Attestation: birth date and signature date share their fields).
   */
  widgetOverrides: { field: string; widget: number; value: string }[];
}

const s = (v: string | undefined | null) => (v ?? "").trim();
const phone = (v: string | undefined) => (s(v) ? formatPhone(s(v)) : "");
const join = (...parts: (string | undefined)[]) =>
  parts
    .map((p) => s(p))
    .filter(Boolean)
    .join(" ");

const SKILL = { BEGINNER: "Débutant", CONFIRMED: "Confirmé", EXPERT: "Expert" } as const;
const LANGUAGE = { NOTIONS: "Notions", FLUENT: "Courant", BILINGUAL: "Bilingue" } as const;

function signatureDate(ctx: MappingContext) {
  return ctx.signedAt ? parisDateParts(ctx.signedAt) : { jour: "", mois: "", annee: "" };
}

export function dossierMapping(ctx: MappingContext): TemplateMapping {
  const id = ctx.data.identity ?? {};
  const c = ctx.data.contact ?? {};
  const crf = ctx.data.crf ?? {};
  const e = ctx.data.emergency ?? {};
  const p = ctx.data.profile ?? {};
  const birth = isoDayParts(id.birthDate);
  const signed = signatureDate(ctx);
  const fields: Record<string, FieldValue> = {
    // Page 1 (cover)
    Nom: s(id.lastName),
    Prénom: s(id.firstName),
    "Structure de rattachement": ctx.ulName,
    // Page 2: Croix-Rouge
    "Déjà bénévole - OUI": crf.alreadyVolunteer === true,
    "Déjà bénévole - NON": crf.alreadyVolunteer === false,
    "NIVOL - Oui": crf.hasNivol === true,
    "NIVOL - Non": crf.hasNivol === false,
    NIVOL: crf.hasNivol ? s(crf.nivol) : "",
    "Mail CRf - OUI": crf.hasCrfEmail === true,
    "Mail CRf - NON": crf.hasCrfEmail === false,
    "Mail CRf": crf.hasCrfEmail ? s(crf.crfEmail) : "",
    // Identity (« Nom de naissance » is the required name line of page 2)
    "Civilité - Mme": id.civility === "MME",
    "Civilité - M": id.civility === "M",
    "Nom de naissance": s(id.birthName) || s(id.lastName),
    "Nom d'usage": s(id.usageName),
    // « Prénom - 2 » is the « Prénom » line of page 2 (with the second first name).
    "Prénom - 2": [s(id.firstName), s(id.secondFirstName)].filter(Boolean).join(", "),
    "Jour naissance": birth.jour,
    "Mois naissance": birth.mois,
    "Année naissance": birth.annee,
    "Ville naissance": s(id.birthCity),
    "Pays naissance": s(id.birthCountry),
    "Département naissance": s(id.birthDepartment),
    // Address and contact
    "Numéro et voie résidence": s(c.street),
    "Complément adresse résidence": s(c.addressComplement),
    "Code postal et ville résidence": join(c.postalCode, c.city),
    "Pays résidence": s(c.country),
    "Téléphone personnel": phone(c.phone),
    "Email personnel": s(c.email),
    "Téléphone professionnel": phone(c.proPhone),
    "Email professionnel": s(c.proEmail),
    // Person to notify
    "Civilité urgence - Mme": e.civility === "MME",
    "Civilité urgence - M": e.civility === "M",
    "Nom urgence": s(e.lastName),
    "Prénom urgence": s(e.firstName),
    "Lien de parenté urgence": s(e.relationship),
    "Adresse urgence": s(e.address),
    "Code Postal et ville urgence": join(e.postalCode, e.city),
    "Pays urgence": s(e.country),
    "Email urgence": s(e.email),
    "Téléphone 1 urgence": phone(e.phone1),
    "Téléphone 2 urgence": phone(e.phone2),
    // Signature date (page 2)
    "Jour signature": signed.jour,
    "Mois signature": signed.mois,
    "Année signature": signed.annee,
    // Page 3: profession
    Profession: s(p.profession),
    "Secteur professionnel": s(p.sector),
    Entreprise: s(p.company),
  };
  for (let i = 0; i < 4; i += 1) fields[`Activité ${String(i + 1)}`] = s(crf.activities?.[i]);
  for (let i = 0; i < 4; i += 1) {
    const skill = p.skills?.[i];
    const n = String(i + 1);
    fields[`Compétence ${n}`] = s(skill?.label);
    for (const [level, label] of Object.entries(SKILL)) {
      fields[`Compétence ${n} - ${label}`] = skill?.level === level;
    }
  }
  for (let i = 0; i < 3; i += 1) {
    const language = p.languages?.[i];
    const n = String(i + 1);
    fields[`Langue ${n}`] = s(language?.label);
    for (const [level, label] of Object.entries(LANGUAGE)) {
      fields[`Langue ${n} - ${label}`] = language?.level === level;
    }
  }
  for (let i = 0; i < 5; i += 1) fields[`Diplome ${String(i + 1)}`] = s(p.diplomas?.[i]);
  for (let i = 0; i < 4; i += 1) {
    const category = s(p.licenses?.[i]);
    fields[`Permis ${String(i + 1)}`] = category ? `Permis ${category}` : "";
  }
  return { fields, signatures: { Signature: "VOLUNTEER" }, empty: {}, widgetOverrides: [] };
}

/**
 * Charte (page 3), read on the PDF (docs/captures/pdf-champs-charte.png):
 * left « Pour le bénévole » (`Fait à`, `Jour`/`Mois`/`Année`, `Nom`, `Prénom`,
 * person to contact in an emergency `nom / qualité` and `numéro de
 * téléphone`, `Signature`); right « Pour la Croix-Rouge française »
 * (`Nom_2`, `Prénom_2`, `Qualité`, `Structure de rattachement 1`/`2`,
 * `Signature 01`); below « Pour le bénévole mineur » (`Nom_3`, `Prénom_3`,
 * `Signature parent`).
 */
export function charteMapping(ctx: MappingContext): TemplateMapping {
  const id = ctx.data.identity ?? {};
  const e = ctx.data.emergency ?? {};
  const g = ctx.data.guardian ?? {};
  const signed = signatureDate(ctx);
  const [structure1, structure2] = splitStructure(ctx.ulName);
  return {
    fields: {
      "Fait à": ctx.signedAt ? ctx.ulCity : "",
      Jour: signed.jour,
      Mois: signed.mois,
      Année: signed.annee,
      Nom: s(id.lastName),
      Prénom: s(id.firstName),
      "nom / qualité": [join(e.firstName, e.lastName), s(e.relationship)]
        .filter(Boolean)
        .join(" / "),
      "numéro de téléphone": phone(e.phone1),
      Nom_2: s(ctx.crf?.lastName),
      Prénom_2: s(ctx.crf?.firstName),
      Qualité: s(ctx.crf?.quality),
      "Structure de rattachement 1": structure1,
      "Structure de rattachement 2": structure2,
      Nom_3: ctx.minor ? s(g.lastName) : "",
      Prénom_3: ctx.minor ? s(g.firstName) : "",
    },
    signatures: {
      Signature: "VOLUNTEER",
      "Signature 01": "CRF_REPRESENTATIVE",
      "Signature parent": "PARENT",
    },
    empty: {},
    widgetOverrides: [],
  };
}

/**
 * « Structure de rattachement » is split over a short first line (113 pt)
 * and a long second one: the first words go on the first line.
 */
export function splitStructure(ulName: string, firstLineChars = 24): [string, string] {
  const words = s(ulName).split(/\s+/).filter(Boolean);
  let first = "";
  let i = 0;
  while (i < words.length && `${first} ${words[i] ?? ""}`.trim().length <= firstLineChars) {
    first = `${first} ${words[i] ?? ""}`.trim();
    i += 1;
  }
  return [first, words.slice(i).join(" ")];
}

export function aptitudeMapping(ctx: MappingContext): TemplateMapping {
  const id = ctx.data.identity ?? {};
  const birth = isoDayParts(id.birthDate);
  const signed = signatureDate(ctx);
  const department = s(id.birthDepartment);
  const city = s(id.birthCity);
  const structure = ctx.ulName.toLowerCase().includes(ctx.ulCity.toLowerCase())
    ? ctx.ulName
    : `${ctx.ulName}, ${ctx.ulCity}`;
  return {
    fields: {
      "Prénom et nom du bénévole": join(id.firstName, id.lastName),
      "Jour de naissance du bénévole": birth.jour,
      "Mois de naissance du bénévole": birth.mois,
      "Année de naissance du bénévole": birth.annee,
      "Lieu de naissance du bénévole": department ? `${city} (${department})` : city,
      "Nom et ville de la structure": `Croix-Rouge française, ${structure}`,
      ...(ctx.nivol ? { NIVOL: ctx.nivol } : {}),
    },
    signatures: { Signature: "VOLUNTEER" },
    // Before Gaia the NIVOL does not exist: the certificate is regenerated with it (step 9).
    empty: ctx.nivol
      ? {}
      : { NIVOL: "Le NIVOL n'existe pas encore : l'étape 9 (Gaia) le complète." },
    // The « Date » line by the signature reuses the three birth-date fields
    // (second widget of each): it receives the signature date instead.
    widgetOverrides: [
      { field: "Jour de naissance du bénévole", widget: 1, value: signed.jour },
      { field: "Mois de naissance du bénévole", widget: 1, value: signed.mois },
      { field: "Année de naissance du bénévole", widget: 1, value: signed.annee },
    ],
  };
}

export const MAPPINGS: Record<TemplateKey, (ctx: MappingContext) => TemplateMapping> = {
  dossier: dossierMapping,
  charte: charteMapping,
  aptitude: aptitudeMapping,
};
