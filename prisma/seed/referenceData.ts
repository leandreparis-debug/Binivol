import type { Perimeter, ReferenceCategory, ReferenceKind } from "../../src/generated/prisma/enums";

/**
 * Reference list: the 21 codes of the legacy workbook, plus PSC, FPSC and
 * ASSIST_FORM. Codes are not personal data.
 *
 * The workbook itself is not in the repository: labels, categories,
 * validities and prerequisites below are a best reconstruction and must be
 * checked against it (see docs/data-model.md, « Référentiel »).
 */
export interface ReferenceSeed {
  code: string;
  label: string;
  category: ReferenceCategory;
  kind: ReferenceKind;
  validityMonths?: number;
  expiresEndOfYear?: boolean;
  perimeters?: Perimeter[];
  prerequisites?: string[];
  note?: string;
}

const TO_CONFIRM = "Hypothèse à confirmer : code absent de l'ancien classeur.";

export const REFERENCE_ITEMS: ReferenceSeed[] = [
  // Tronc commun
  {
    code: "PSC",
    label: "Prévention et secours civiques de niveau 1",
    category: "TRONC_COMMUN",
    kind: "TRAINING",
    perimeters: ["ACTION"],
    note: TO_CONFIRM,
  },
  {
    code: "TCAU",
    label: "Tronc commun acteur de l'urgence",
    category: "TRONC_COMMUN",
    kind: "TRAINING",
    perimeters: ["LASER"],
  },
  {
    code: "TCAS",
    label: "Tronc commun action sociale",
    category: "TRONC_COMMUN",
    kind: "TRAINING",
  },
  {
    code: "TCEO",
    label: "Tronc commun encadrement opérationnel",
    category: "TRONC_COMMUN",
    kind: "TRAINING",
  },
  // Secours — trainings
  {
    code: "PSE",
    label: "Premiers secours en équipe",
    category: "SECOURS",
    kind: "TRAINING",
    perimeters: ["ACTION", "LASER"],
  },
  {
    code: "FCPSE",
    label: "Formation continue PSE",
    category: "SECOURS",
    kind: "TRAINING",
    expiresEndOfYear: true,
    prerequisites: ["PSE"],
  },
  {
    code: "OPR",
    label: "Opérateur radio",
    category: "SECOURS",
    kind: "TRAINING",
    validityMonths: 36,
  },
  {
    code: "ECG",
    label: "Réalisation d'électrocardiogramme",
    category: "SECOURS",
    kind: "TRAINING",
    prerequisites: ["PSE"],
  },
  // Secours — functions (forbidden for minors)
  {
    code: "CHEF_PAPS",
    label: "Chef de point d'alerte et de premiers secours",
    category: "SECOURS",
    kind: "FUNCTION",
    prerequisites: ["PSE"],
  },
  {
    code: "CI",
    label: "Chef d'intervention",
    category: "SECOURS",
    kind: "FUNCTION",
    prerequisites: ["F_CI"],
  },
  {
    code: "CDPE",
    label: "Chef de dispositif",
    category: "SECOURS",
    kind: "FUNCTION",
    prerequisites: ["CI"],
  },
  {
    code: "CI_SDIS",
    label: "Chef d'intervention conventionné SDIS",
    category: "SECOURS",
    kind: "FUNCTION",
    prerequisites: ["CI"],
  },
  { code: "CH_TECH", label: "Chargé technique", category: "SECOURS", kind: "FUNCTION" },
  { code: "CH_FIXE", label: "Chargé poste fixe", category: "SECOURS", kind: "FUNCTION" },
  { code: "CH_MOBILE", label: "Chargé poste mobile", category: "SECOURS", kind: "FUNCTION" },
  {
    code: "CH_RESEAUX",
    label: "Chargé réseaux",
    category: "SECOURS",
    kind: "FUNCTION",
    prerequisites: ["OPR"],
  },
  // Formation interne secours
  {
    code: "F_CI",
    label: "Formation chef d'intervention",
    category: "FORMATION_IS",
    kind: "TRAINING",
    prerequisites: ["PSE"],
  },
  { code: "F_CH", label: "Formation chargé", category: "FORMATION_IS", kind: "TRAINING" },
  {
    code: "FCCI",
    label: "Formation continue chef d'intervention",
    category: "FORMATION_IS",
    kind: "TRAINING",
    expiresEndOfYear: true,
    prerequisites: ["F_CI"],
  },
  {
    code: "FPSE",
    label: "Formateur PSE",
    category: "FORMATION_IS",
    kind: "TRAINING",
    perimeters: ["FORMAT_GP"],
    prerequisites: ["PSE"],
  },
  // Formation grand public
  {
    code: "FPSC",
    label: "Formateur PSC",
    category: "FORMATION_GP",
    kind: "TRAINING",
    perimeters: ["FORMAT_GP"],
    prerequisites: ["PSC"],
    note: TO_CONFIRM,
  },
  {
    code: "ASSIST_FORM",
    label: "Assistant de formation",
    category: "FORMATION_GP",
    kind: "FUNCTION",
    perimeters: ["FORMAT_GP"],
    note: TO_CONFIRM,
  },
  // Autre
  { code: "GQS", label: "Gestes qui sauvent", category: "AUTRE", kind: "TRAINING" },
  { code: "CRB", label: "CRB (libellé à confirmer)", category: "AUTRE", kind: "TRAINING" },
];

/** The 21 codes of the legacy workbook (without the three additions). */
export const LEGACY_CODES = [
  "PSE",
  "FCPSE",
  "F_CI",
  "F_CH",
  "OPR",
  "ECG",
  "GQS",
  "CRB",
  "TCAU",
  "TCAS",
  "CHEF_PAPS",
  "CI",
  "CDPE",
  "CI_SDIS",
  "CH_TECH",
  "CH_FIXE",
  "CH_MOBILE",
  "CH_RESEAUX",
  "FPSE",
  "FCCI",
  "TCEO",
] as const;

/** Every SECOURS function is forbidden for minors. */
export function isForbiddenForMinors(item: ReferenceSeed): boolean {
  return item.category === "SECOURS" && item.kind === "FUNCTION";
}
