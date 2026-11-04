/**
 * Structure of the legacy workbook « v03 » (row 1 of each sheet), as
 * documented in docs/data-model.md. Every listed column is expected: a missing
 * one is a blocking error; an unknown one is a warning.
 */
export const SHEET_COLUMNS = {
  Referentiel: [
    "Code",
    "Libellé",
    "Catégorie",
    "Type",
    "Ordre",
    "Validité (mois)",
    "Prérequis",
    "Interdite aux mineurs",
    "Actif",
    "Source / commentaire",
    "Échéance au 31/12",
  ],
  Parametres: ["Clé", "Valeur", "Description"],
  Benevoles: [
    "NIVOL",
    "Prénom",
    "Nom",
    "E-mail",
    "Téléphone",
    "Date de naissance",
    "Statut",
    "Date d'entrée",
    "Date de départ",
    "Adhérent",
    "Aptitude (Pegass)",
    "Date aptitude",
    "Autre AASC",
    "Formateur",
    "Encadrant régulier mineurs",
    "Date vérif. B3",
    "Autorisation parentale",
    "Date autorisation",
    "Notes",
    "Modifié le",
    "Modifié par",
    "Dossier Drive",
  ],
  Prospects: [
    "ID",
    "Prénom",
    "Nom",
    "E-mail",
    "Téléphone",
    "Date de naissance",
    "Source",
    "Intérêt",
    "Date de premier contact",
    "Étape",
    "Prochaine action",
    "Date de relance",
    "Notes",
    "NIVOL attribué",
    "Saisi le",
    "Saisi par",
    "Modifié le",
    "Modifié par",
  ],
  Sessions: [
    "ID",
    "NIVOL",
    "Code",
    "Date",
    "Résultat",
    "Organisme / lieu",
    "Lien Pegass",
    "Commentaire",
    "Saisi le",
    "Saisi par",
  ],
  Fonctions: [
    "ID",
    "NIVOL",
    "Fonction",
    "Date de début",
    "Date de fin",
    "Autorisée par",
    "Référence décision",
    "Commentaire",
    "Saisi le",
    "Saisi par",
    "Annulée",
  ],
  Journal: [
    "Horodatage",
    "Utilisateur",
    "Action",
    "Table",
    "Clé",
    "Champ",
    "Ancienne valeur",
    "Nouvelle valeur",
  ],
} as const;

export type SheetName = keyof typeof SHEET_COLUMNS;
export type ColumnOf<S extends SheetName> = (typeof SHEET_COLUMNS)[S][number];

/** Import order: reference data first, then people, then what refers to them. */
export const IMPORT_ORDER: readonly SheetName[] = [
  "Referentiel",
  "Parametres",
  "Benevoles",
  "Prospects",
  "Sessions",
  "Fonctions",
  "Journal",
];

/** Header comparison: trimmed, inner spaces collapsed, Unicode NFC. */
export function normalizeHeader(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}
