import type { DossierDraft } from "@/lib/dossierSchema";
import { formatPhone } from "@/lib/phone";
import { isoDayParts, parisDateParts } from "./text";
import type { TemplateKind } from "./templates";

/**
 * Correspondence between the official templates and the dossier (step 8):
 * one object per template, **exact field name → value**. Text fields take a
 * string (empty: left blank), check boxes a boolean (`/Oui` or `/Off`).
 * The signature fields are not here: an image is laid in their rectangle
 * (`SIGNATURE_FIELDS`). A test loads each template and checks that every
 * field of the mapping exists, and that no field is forgotten without being
 * listed in `INTENTIONALLY_EMPTY`.
 */

export interface PdfPerson {
  lastName: string;
  firstName: string;
  /** Free text, e.g. « Adjoint animation des équipes (DIAMANT) ». */
  quality: string;
}

export interface PdfInput {
  /** The submitted (normalised) dossier. */
  data: DossierDraft;
  /** Setting `UL_NAME`: « Structure de rattachement ». */
  structure: string;
  /** Setting `UL_CITY`: « Fait à ». */
  city: string;
  /** Date of the volunteer's signature (« Le … », « Date »). Null before signing (preview). */
  signedOn: Date | null;
  /** The Croix-Rouge representative counter-signing the charter. Null before. */
  representative: PdfPerson | null;
  /** NIVOL of the person's page (given by Gaia, step 9); never the declared one. Null at step 8. */
  nivol: string | null;
}

export type FieldValue = string | boolean;
export type Mapping = Record<string, (input: PdfInput) => FieldValue>;

const s = (v: string | undefined | null) => (v ?? "").trim();
const join = (...parts: (string | undefined | null)[]) =>
  parts
    .map(s)
    .filter((p) => p !== "")
    .join(" ");
const phone = (v: string | undefined) => (v ? formatPhone(v) : "");
const isMinor = (input: PdfInput) => Boolean(input.data.guardian?.lastName);

function birth(input: PdfInput) {
  return isoDayParts(input.data.identity?.birthDate);
}
function signed(input: PdfInput) {
  return input.signedOn ? parisDateParts(input.signedOn) : null;
}

const skill = (i: number) => (input: PdfInput) => input.data.profile?.skills?.[i];
const language = (i: number) => (input: PdfInput) => input.data.profile?.languages?.[i];

function skillFields(): Mapping {
  const out: Mapping = {};
  for (let i = 0; i < 4; i++) {
    const n = String(i + 1);
    out[`Compétence ${n}`] = (input) => s(skill(i)(input)?.label);
    out[`Compétence ${n} - Débutant`] = (input) => skill(i)(input)?.level === "BEGINNER";
    out[`Compétence ${n} - Confirmé`] = (input) => skill(i)(input)?.level === "CONFIRMED";
    out[`Compétence ${n} - Expert`] = (input) => skill(i)(input)?.level === "EXPERT";
  }
  for (let i = 0; i < 3; i++) {
    const n = String(i + 1);
    out[`Langue ${n}`] = (input) => s(language(i)(input)?.label);
    out[`Langue ${n} - Notions`] = (input) => language(i)(input)?.level === "NOTIONS";
    out[`Langue ${n} - Courant`] = (input) => language(i)(input)?.level === "FLUENT";
    out[`Langue ${n} - Bilingue`] = (input) => language(i)(input)?.level === "BILINGUAL";
  }
  for (let i = 0; i < 4; i++) {
    out[`Activité ${String(i + 1)}`] = (input) => s(input.data.crf?.activities?.[i]);
    out[`Permis ${String(i + 1)}`] = (input) => s(input.data.profile?.licenses?.[i]);
  }
  for (let i = 0; i < 5; i++) {
    out[`Diplome ${String(i + 1)}`] = (input) => s(input.data.profile?.diplomas?.[i]);
  }
  return out;
}

const DOSSIER: Mapping = {
  Nom: (i) => s(i.data.identity?.lastName),
  Prénom: (i) => s(i.data.identity?.firstName),
  // Page 2 repeats the first name (« Prénom* ») : every first name, the second one included.
  "Prénom - 2": (i) => join(i.data.identity?.firstName, i.data.identity?.secondFirstName),
  "Nom d'usage": (i) => s(i.data.identity?.usageName),
  // Required on the form: the birth name, or the name when it did not change.
  "Nom de naissance": (i) => s(i.data.identity?.birthName) || s(i.data.identity?.lastName),
  "Civilité - Mme": (i) => i.data.identity?.civility === "MME",
  "Civilité - M": (i) => i.data.identity?.civility === "M",
  "Jour naissance": (i) => birth(i)?.day ?? "",
  "Mois naissance": (i) => birth(i)?.month ?? "",
  "Année naissance": (i) => birth(i)?.year ?? "",
  "Ville naissance": (i) => s(i.data.identity?.birthCity),
  "Département naissance": (i) => s(i.data.identity?.birthDepartment),
  "Pays naissance": (i) => s(i.data.identity?.birthCountry),
  "Numéro et voie résidence": (i) => s(i.data.contact?.street),
  "Complément adresse résidence": (i) => s(i.data.contact?.addressComplement),
  "Code postal et ville résidence": (i) => join(i.data.contact?.postalCode, i.data.contact?.city),
  "Pays résidence": (i) => s(i.data.contact?.country),
  "Téléphone personnel": (i) => phone(i.data.contact?.phone),
  "Email personnel": (i) => s(i.data.contact?.email),
  "Téléphone professionnel": (i) => phone(i.data.contact?.proPhone),
  "Email professionnel": (i) => s(i.data.contact?.proEmail),
  "Structure de rattachement": (i) => s(i.structure),
  "Déjà bénévole - OUI": (i) => i.data.crf?.alreadyVolunteer === true,
  "Déjà bénévole - NON": (i) => i.data.crf?.alreadyVolunteer === false,
  "NIVOL - Oui": (i) => i.data.crf?.hasNivol === true,
  "NIVOL - Non": (i) => i.data.crf?.hasNivol === false,
  // The NIVOL the candidate declared (her own statement on her own form).
  NIVOL: (i) => s(i.data.crf?.nivol),
  "Mail CRf - OUI": (i) => i.data.crf?.hasCrfEmail === true,
  "Mail CRf - NON": (i) => i.data.crf?.hasCrfEmail === false,
  "Mail CRf": (i) => s(i.data.crf?.crfEmail),
  "Civilité urgence - Mme": (i) => i.data.emergency?.civility === "MME",
  "Civilité urgence - M": (i) => i.data.emergency?.civility === "M",
  "Nom urgence": (i) => s(i.data.emergency?.lastName),
  "Prénom urgence": (i) => s(i.data.emergency?.firstName),
  "Lien de parenté urgence": (i) => s(i.data.emergency?.relationship),
  "Adresse urgence": (i) => s(i.data.emergency?.address),
  "Code Postal et ville urgence": (i) => join(i.data.emergency?.postalCode, i.data.emergency?.city),
  "Pays urgence": (i) => s(i.data.emergency?.country),
  "Email urgence": (i) => s(i.data.emergency?.email),
  "Téléphone 1 urgence": (i) => phone(i.data.emergency?.phone1),
  "Téléphone 2 urgence": (i) => phone(i.data.emergency?.phone2),
  Profession: (i) => s(i.data.profile?.profession),
  "Secteur professionnel": (i) => s(i.data.profile?.sector),
  Entreprise: (i) => s(i.data.profile?.company),
  ...skillFields(),
  "Jour signature": (i) => signed(i)?.day ?? "",
  "Mois signature": (i) => signed(i)?.month ?? "",
  "Année signature": (i) => signed(i)?.year ?? "",
};

/**
 * Charter, page 3 (reading of the fields on the rendered page,
 * `docs/captures/pdf-champs-charte.png`):
 * - left column « Pour le bénévole »: `Fait à`, `Jour`/`Mois`/`Année`, `Nom`,
 *   `Prénom`, the person to notify (`nom / qualité`, `numéro de téléphone`),
 *   and `Signature`;
 * - right column « Pour la Croix-Rouge française »: `Nom_2`, `Prénom_2`,
 *   `Qualité`, `Structure de rattachement 1` / `2`, `Signature 01`;
 * - « Pour le bénévole mineur »: the legal guardian, `Nom_3`, `Prénom_3`,
 *   `Signature parent`.
 * The two structure fields are split by `fill.ts` (`STRUCTURE_SPLIT`).
 */
const CHARTE: Mapping = {
  "Fait à": (i) => (i.signedOn ? s(i.city) : ""),
  Jour: (i) => signed(i)?.day ?? "",
  Mois: (i) => signed(i)?.month ?? "",
  Année: (i) => signed(i)?.year ?? "",
  Nom: (i) => s(i.data.identity?.lastName),
  Prénom: (i) => s(i.data.identity?.firstName),
  "nom / qualité": (i) => {
    const e = i.data.emergency;
    const name = join(e?.firstName, e?.lastName);
    return name && e?.relationship ? `${name} / ${s(e.relationship)}` : name;
  },
  "numéro de téléphone": (i) => phone(i.data.emergency?.phone1),
  Nom_2: (i) => s(i.representative?.lastName),
  Prénom_2: (i) => s(i.representative?.firstName),
  Qualité: (i) => s(i.representative?.quality),
  Nom_3: (i) => (isMinor(i) ? s(i.data.guardian?.lastName) : ""),
  Prénom_3: (i) => (isMinor(i) ? s(i.data.guardian?.firstName) : ""),
};

/**
 * Aptitude certificate. The template reuses the three birth-date fields for
 * the « Date » line at the bottom (a second widget of the same fields): that
 * second widget gets the signature date instead (`SECOND_WIDGET_DATES`).
 */
const APTITUDE: Mapping = {
  "Prénom et nom du bénévole": (i) => join(i.data.identity?.firstName, i.data.identity?.lastName),
  "Jour de naissance du bénévole": (i) => birth(i)?.day ?? "",
  "Mois de naissance du bénévole": (i) => birth(i)?.month ?? "",
  "Année de naissance du bénévole": (i) => birth(i)?.year ?? "",
  "Lieu de naissance du bénévole": (i) => {
    const id = i.data.identity;
    const dept = s(id?.birthDepartment);
    const place = [s(id?.birthCity), dept ? `(${dept})` : ""].filter(Boolean).join(" ");
    const country = s(id?.birthCountry);
    return country && country.toLowerCase() !== "france" ? `${place}, ${country}` : place;
  },
  "Nom et ville de la structure": (i) => {
    const structure = s(i.structure);
    return structure.toLowerCase().includes(s(i.city).toLowerCase())
      ? structure
      : join(structure, i.city ? `(${s(i.city)})` : "");
  },
  // Empty at step 8: the NIVOL is given by Gaia, step 9 completes it. Never the declared one.
  NIVOL: (i) => s(i.nivol),
};

export const MAPPINGS: Record<TemplateKind, Mapping> = { DOSSIER, CHARTE, APTITUDE };

export type SignatureSlot = "VOLUNTEER" | "PARENT" | "CRF_REPRESENTATIVE";

/** Signature fields: an image of the signature is laid in their rectangle. */
export const SIGNATURE_FIELDS: Record<TemplateKind, Partial<Record<SignatureSlot, string>>> = {
  DOSSIER: { VOLUNTEER: "Signature" },
  CHARTE: {
    VOLUNTEER: "Signature",
    CRF_REPRESENTATIVE: "Signature 01",
    PARENT: "Signature parent",
  },
  APTITUDE: { VOLUNTEER: "Signature" },
};

/** Structure fields of the charter, filled from one text split over the two. */
export const STRUCTURE_SPLIT = [
  "Structure de rattachement 1",
  "Structure de rattachement 2",
] as const;

/** Fields of the aptitude certificate whose second widget (« Date ») gets the signature date. */
export const SECOND_WIDGET_DATES: Record<string, "day" | "month" | "year"> = {
  "Jour de naissance du bénévole": "day",
  "Mois de naissance du bénévole": "month",
  "Année de naissance du bénévole": "year",
};

/** Fields deliberately left empty, with the reason. */
export const INTENTIONALLY_EMPTY: Record<TemplateKind, Record<string, string>> = {
  DOSSIER: {},
  CHARTE: {},
  APTITUDE: {},
};

/** Every value of a template for this input (text fields and check boxes). */
export function templateValues(kind: TemplateKind, input: PdfInput): Record<string, FieldValue> {
  return Object.fromEntries(
    Object.entries(MAPPINGS[kind]).map(([name, get]) => [name, get(input)]),
  );
}
