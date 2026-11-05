import type { DossierDraft, DossierStep } from "@/lib/dossierSchema";
import { GUARDIAN_QUALITIES } from "@/lib/dossierForms";

/**
 * Declarative fields of the simple steps of the dossier form (identity,
 * contact, person to notify, legal guardian). The same list renders the step
 * and its summary on the review step. Lengths match the draft schema and the
 * PDF fields (docs/dossier.md).
 */

export type TextSection = "identity" | "contact" | "emergency" | "guardian";

interface BaseDef {
  section: TextSection;
  name: string;
  label: string;
  hint?: string;
  /** Shown as required (the rule itself lives in `submissionIssues`). */
  required?: boolean | ((draft: DossierDraft) => boolean);
}

export interface InputDef extends BaseDef {
  kind: "text" | "email" | "tel" | "date" | "postal";
  autoComplete?: string;
  maxLength: number;
  placeholder?: string;
}

interface OptionsDef extends BaseDef {
  options: readonly { value: string; label: string }[];
}

/** Pill radios (short choice). */
export interface ChoiceDef extends OptionsDef {
  kind: "choice";
}

/** Native select (longer list). */
export interface SelectDef extends OptionsDef {
  kind: "select";
}

export type FieldDef = InputDef | ChoiceDef | SelectDef;

const CIVILITIES = [
  { value: "MME", label: "Madame" },
  { value: "M", label: "Monsieur" },
] as const;

const bornInFrance = (draft: DossierDraft) => {
  const c = (draft.identity?.birthCountry ?? "").trim().toLowerCase();
  return c === "" || c === "france";
};

export const STEP_FIELDS: Partial<Record<DossierStep, FieldDef[]>> = {
  identite: [
    {
      kind: "choice",
      section: "identity",
      name: "civility",
      label: "Civilité",
      options: CIVILITIES,
      required: true,
    },
    {
      kind: "text",
      section: "identity",
      name: "lastName",
      label: "Nom",
      autoComplete: "family-name",
      maxLength: 50,
      required: true,
    },
    {
      kind: "text",
      section: "identity",
      name: "birthName",
      label: "Nom de naissance",
      hint: "Si différent de votre nom.",
      maxLength: 50,
    },
    {
      kind: "text",
      section: "identity",
      name: "usageName",
      label: "Nom d'usage",
      maxLength: 50,
    },
    {
      kind: "text",
      section: "identity",
      name: "firstName",
      label: "Prénom",
      autoComplete: "given-name",
      maxLength: 50,
      required: true,
    },
    {
      kind: "text",
      section: "identity",
      name: "secondFirstName",
      label: "Second prénom",
      autoComplete: "additional-name",
      maxLength: 50,
    },
    {
      kind: "date",
      section: "identity",
      name: "birthDate",
      label: "Date de naissance",
      autoComplete: "bday",
      maxLength: 10,
      required: true,
    },
    {
      kind: "text",
      section: "identity",
      name: "birthCity",
      label: "Ville de naissance",
      maxLength: 60,
      required: true,
    },
    {
      kind: "text",
      section: "identity",
      name: "birthCountry",
      label: "Pays de naissance",
      placeholder: "France",
      maxLength: 60,
      required: true,
    },
    {
      kind: "text",
      section: "identity",
      name: "birthDepartment",
      label: "Département de naissance",
      hint: "Par exemple : 78 ou Yvelines. Seulement si vous êtes né ou née en France.",
      maxLength: 60,
      required: bornInFrance,
    },
  ],
  coordonnees: [
    {
      kind: "text",
      section: "contact",
      name: "street",
      label: "Numéro et voie",
      autoComplete: "address-line1",
      maxLength: 100,
      required: true,
    },
    {
      kind: "text",
      section: "contact",
      name: "addressComplement",
      label: "Complément d'adresse",
      hint: "Bâtiment, étage, lieu-dit…",
      autoComplete: "address-line2",
      maxLength: 100,
    },
    {
      kind: "postal",
      section: "contact",
      name: "postalCode",
      label: "Code postal",
      autoComplete: "postal-code",
      maxLength: 10,
      required: true,
    },
    {
      kind: "text",
      section: "contact",
      name: "city",
      label: "Ville",
      autoComplete: "address-level2",
      maxLength: 60,
      required: true,
    },
    {
      kind: "text",
      section: "contact",
      name: "country",
      label: "Pays de résidence",
      autoComplete: "country-name",
      placeholder: "France",
      maxLength: 60,
      required: true,
    },
    {
      kind: "tel",
      section: "contact",
      name: "phone",
      label: "Téléphone personnel",
      autoComplete: "tel",
      maxLength: 20,
      required: true,
    },
    {
      kind: "email",
      section: "contact",
      name: "email",
      label: "E-mail personnel",
      autoComplete: "email",
      maxLength: 120,
      required: true,
    },
    {
      kind: "tel",
      section: "contact",
      name: "proPhone",
      label: "Téléphone professionnel",
      maxLength: 20,
    },
    {
      kind: "email",
      section: "contact",
      name: "proEmail",
      label: "E-mail professionnel",
      maxLength: 120,
    },
  ],
  urgence: [
    {
      kind: "choice",
      section: "emergency",
      name: "civility",
      label: "Civilité",
      options: CIVILITIES,
    },
    {
      kind: "text",
      section: "emergency",
      name: "lastName",
      label: "Nom",
      maxLength: 50,
      required: true,
    },
    {
      kind: "text",
      section: "emergency",
      name: "firstName",
      label: "Prénom",
      maxLength: 50,
      required: true,
    },
    {
      kind: "text",
      section: "emergency",
      name: "relationship",
      label: "Lien de parenté",
      hint: "Par exemple : mère, conjoint, ami.",
      maxLength: 40,
      required: true,
    },
    {
      kind: "tel",
      section: "emergency",
      name: "phone1",
      label: "Téléphone 1",
      maxLength: 20,
      required: true,
    },
    { kind: "tel", section: "emergency", name: "phone2", label: "Téléphone 2", maxLength: 20 },
    { kind: "email", section: "emergency", name: "email", label: "E-mail", maxLength: 120 },
    { kind: "text", section: "emergency", name: "address", label: "Adresse", maxLength: 100 },
    {
      kind: "postal",
      section: "emergency",
      name: "postalCode",
      label: "Code postal",
      maxLength: 10,
    },
    { kind: "text", section: "emergency", name: "city", label: "Ville", maxLength: 60 },
    { kind: "text", section: "emergency", name: "country", label: "Pays", maxLength: 60 },
  ],
  representant: [
    {
      kind: "text",
      section: "guardian",
      name: "lastName",
      label: "Nom du représentant légal",
      maxLength: 50,
      required: true,
    },
    {
      kind: "text",
      section: "guardian",
      name: "firstName",
      label: "Prénom du représentant légal",
      maxLength: 50,
      required: true,
    },
    {
      kind: "select",
      section: "guardian",
      name: "quality",
      label: "Qualité",
      options: GUARDIAN_QUALITIES.map((q) => ({ value: q, label: q })),
      required: true,
    },
    {
      kind: "tel",
      section: "guardian",
      name: "phone",
      label: "Téléphone du représentant légal",
      maxLength: 20,
      required: true,
    },
    {
      kind: "email",
      section: "guardian",
      name: "email",
      label: "E-mail du représentant légal",
      hint: "Son propre e-mail : il y recevra un code pour signer la charte.",
      maxLength: 120,
      required: true,
    },
  ],
};

export function fieldValue(draft: DossierDraft, def: Pick<FieldDef, "section" | "name">): string {
  const section = draft[def.section] as Record<string, unknown> | undefined;
  const value = section?.[def.name];
  return typeof value === "string" ? value : "";
}

export function isRequired(def: FieldDef, draft: DossierDraft): boolean {
  return typeof def.required === "function" ? def.required(draft) : Boolean(def.required);
}

/** Id of the control of a field: stable, used by the labels and the e2e tests. */
export const fieldId = (section: string, name: string) => `dossier-${section}-${name}`;

/** Display text of a field value (date as JJ/MM/AAAA, choices by label). */
export function displayValue(def: FieldDef, value: string): string {
  if (value.trim() === "") return "";
  if (def.kind === "date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d ?? ""}/${m ?? ""}/${y ?? ""}`;
  }
  if (def.kind === "choice" || def.kind === "select") {
    return def.options.find((o) => o.value === value)?.label ?? value;
  }
  return value;
}
