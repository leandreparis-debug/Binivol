import type {
  Perimeter,
  Profile,
  ReferenceCategory,
  ReferenceKind,
} from "../../src/generated/prisma/enums";

/**
 * Reference list: the 21 codes of the legacy workbook (« Referentiel » sheet,
 * exact values — not personal data), plus PSC, FPSC and ASSIST_FORM, which are
 * hypotheses absent from the workbook.
 *
 * No code has a validity in months and none has a prerequisite in the
 * workbook. Perimeters (visibility) and `managedBy` (who may appoint) are
 * Binivol additions, documented in docs/data-model.md.
 */
export interface ReferenceSeed {
  code: string;
  label: string;
  category: ReferenceCategory;
  kind: ReferenceKind;
  forbiddenForMinors: boolean;
  expiresEndOfYear: boolean;
  perimeters?: Perimeter[];
  managedBy?: Profile[];
  note?: string;
}

const VALIDITY_TO_FILL = "Validité à renseigner";
const DRIVER_NOTE =
  "Interprétation à valider (équipage d'évacuation interdit aux mineurs, permis requis)";
const HYPOTHESIS = "Hypothèse, absent de l'ancien classeur";

/** In workbook order: `sortOrder` is the position (1 to 21, then 22 to 24, then 25 to 27: initiators, step 16). */
export const REFERENCE_ITEMS: ReferenceSeed[] = [
  {
    code: "PSE",
    label: "Premiers secours en équipe",
    category: "FORMATION_IS",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
    perimeters: ["ACTION", "LASER"],
  },
  {
    code: "FCPSE",
    label: "Formation continue PSE",
    category: "FORMATION_IS",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: true,
    note: VALIDITY_TO_FILL,
  },
  {
    code: "F_CI",
    label: "Formation chef d'intervention",
    category: "FORMATION_IS",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
  },
  {
    code: "F_CH",
    label: "Formation chauffeur",
    category: "FORMATION_IS",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
  },
  {
    code: "OPR",
    label: "Opérateur radio",
    category: "FORMATION_IS",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
  },
  {
    code: "ECG",
    label: "Formation ECG (réseau de secours)",
    category: "FORMATION_IS",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
  },
  {
    code: "GQS",
    label: "Gestes qui sauvent",
    category: "TRONC_COMMUN",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
  },
  {
    code: "CRB",
    label: "Croix-Rouge Bienvenue (eCRB)",
    category: "TRONC_COMMUN",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
  },
  {
    code: "TCAU",
    label: "Tronc commun des acteurs de l'urgence (eTCAU)",
    category: "TRONC_COMMUN",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
    perimeters: ["LASER"],
  },
  {
    code: "TCAS",
    label: "Tronc commun des acteurs de la solidarité (eTCAS)",
    category: "TRONC_COMMUN",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
  },
  {
    code: "CHEF_PAPS",
    label: "Chef de PAPS",
    category: "SECOURS",
    kind: "FUNCTION",
    forbiddenForMinors: true,
    expiresEndOfYear: false,
    managedBy: ["ACTION"],
  },
  {
    code: "CI",
    label: "Chef d'intervention (fonction)",
    category: "SECOURS",
    kind: "FUNCTION",
    forbiddenForMinors: true,
    expiresEndOfYear: false,
    managedBy: ["LASER"],
  },
  {
    code: "CDPE",
    label: "Chef de dispositif de petite envergure",
    category: "SECOURS",
    kind: "FUNCTION",
    forbiddenForMinors: true,
    expiresEndOfYear: false,
    managedBy: ["ACTION"],
  },
  {
    code: "CI_SDIS",
    label: "CI réseau de secours SDIS",
    category: "SECOURS",
    kind: "FUNCTION",
    forbiddenForMinors: true,
    expiresEndOfYear: false,
    managedBy: ["LASER"],
  },
  {
    code: "CH_TECH",
    label: "Chauffeur technique",
    category: "SECOURS",
    kind: "FUNCTION",
    forbiddenForMinors: true,
    expiresEndOfYear: false,
    managedBy: ["ACTION", "LASER"],
    note: DRIVER_NOTE,
  },
  {
    code: "CH_FIXE",
    label: "Chauffeur fixe",
    category: "SECOURS",
    kind: "FUNCTION",
    forbiddenForMinors: true,
    expiresEndOfYear: false,
    managedBy: ["ACTION", "LASER"],
    note: DRIVER_NOTE,
  },
  {
    code: "CH_MOBILE",
    label: "Chauffeur mobile",
    category: "SECOURS",
    kind: "FUNCTION",
    forbiddenForMinors: true,
    expiresEndOfYear: false,
    managedBy: ["ACTION", "LASER"],
    note: DRIVER_NOTE,
  },
  {
    code: "CH_RESEAUX",
    label: "Chauffeur réseaux",
    category: "SECOURS",
    kind: "FUNCTION",
    forbiddenForMinors: true,
    expiresEndOfYear: false,
    managedBy: ["ACTION", "LASER"],
    note: DRIVER_NOTE,
  },
  {
    code: "FPSE",
    label: "Formateur PSE",
    category: "FORMATION_IS",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
    perimeters: ["FORMAT_GP"],
    note: VALIDITY_TO_FILL,
  },
  {
    code: "FCCI",
    label: "Formation continue chef d'intervention",
    category: "FORMATION_IS",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: true,
    note: "Libellé à confirmer",
  },
  {
    code: "TCEO",
    label: "Tronc commun des encadrants opérationnels",
    category: "FORMATION_IS",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
  },
  // Hypotheses (not in the workbook).
  {
    code: "PSC",
    label: "Prévention et secours civiques de niveau 1",
    category: "TRONC_COMMUN",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
    perimeters: ["ACTION"],
    note: HYPOTHESIS,
  },
  {
    code: "FPSC",
    label: "Formateur PSC",
    category: "FORMATION_GP",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
    perimeters: ["FORMAT_GP"],
    note: HYPOTHESIS,
  },
  {
    code: "ASSIST_FORM",
    label: "Assistant de formation",
    category: "FORMATION_GP",
    kind: "FUNCTION",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
    perimeters: ["FORMAT_GP"],
    managedBy: ["FORMAT_GP"],
    note: HYPOTHESIS,
  },
  // Step 16 (tableau de bord DLUS): initiators, absent from the legacy workbook.
  // Hypothesis to confirm: the workbook's « GQS » is the GQS training a volunteer
  // followed, not the right to teach it (« initiateur GQS »).
  {
    code: "I_GQS",
    label: "Initiateur GQS",
    category: "FORMATION_GP",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
    perimeters: ["FORMAT_GP"],
    note: HYPOTHESIS,
  },
  {
    code: "I_IPS",
    label: "Initiateur IPS (initiation aux premiers secours)",
    category: "FORMATION_GP",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
    perimeters: ["FORMAT_GP"],
    note: HYPOTHESIS,
  },
  {
    code: "I_IPSEN",
    label: "Initiateur IPSEN (premiers secours enfants et nourrissons)",
    category: "FORMATION_GP",
    kind: "TRAINING",
    forbiddenForMinors: false,
    expiresEndOfYear: false,
    perimeters: ["FORMAT_GP"],
    note: HYPOTHESIS,
  },
];

/** The 21 codes of the legacy workbook, in its order. */
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

/** Codes added by Binivol, to confirm. */
export const HYPOTHESIS_CODES = ["PSC", "FPSC", "ASSIST_FORM"] as const;
