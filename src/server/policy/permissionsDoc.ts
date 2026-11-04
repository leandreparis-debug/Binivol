import { PROFILE_LABELS, POLICY_ACTION_LABELS } from "@/lib/labels";
import { describeGrant } from "./can";
import { ALL_PROFILES, MATRIX, MATRIX_ACTIONS } from "./matrix";

export const PERMISSIONS_DOC_PATH = "docs/permissions.md";

const TARGET_LABELS = {
  none: "—",
  person: "une personne",
  personAndFunction: "une personne et une fonction",
} as const;

/**
 * Renders docs/permissions.md from the matrix. Pure and deterministic: a test
 * compares its output with the committed file (`pnpm docs:permissions`).
 */
export function renderPermissionsDoc(): string {
  const header = `| Action | Porte sur | ${ALL_PROFILES.join(" | ")} |`;
  const separator = `| --- | --- | ${ALL_PROFILES.map(() => "---").join(" | ")} |`;
  const rows = MATRIX_ACTIONS.map((action) => {
    const cells = ALL_PROFILES.map((profile) => describeGrant(action, profile));
    return `| ${POLICY_ACTION_LABELS[action]} (\`${action}\`) | ${TARGET_LABELS[MATRIX[action].target]} | ${cells.join(" | ")} |`;
  });
  const profiles = ALL_PROFILES.map((p) => `- **${p}** : ${PROFILE_LABELS[p]}`);

  return [
    "<!-- Fichier généré par `pnpm docs:permissions` depuis src/server/policy/matrix.ts. Ne pas modifier à la main. -->",
    "",
    "# Droits d'accès",
    "",
    "Toutes les règles sont appliquées par `can()` (`src/server/policy/can.ts`), fonction pure, à partir de la matrice `src/server/policy/matrix.ts`. Les profils se cumulent : un compte a l'union des droits de ses profils.",
    "",
    "## Profils",
    "",
    ...profiles,
    "",
    "## Matrice",
    "",
    header,
    separator,
    ...rows,
    "",
    "## Lexique",
    "",
    "- **Relève du profil** : une personne archivée ne relève de personne. Elle relève d'ACTION, LASER ou FORMAT GP quand elle n'est pas candidate et que son périmètre contient celui du profil : formations validées et non expirées, nominations actives et case « Formateur » (FORMAT GP), selon `reference_items.perimeters`. Elle relève de DIAMANT quand elle est dans le périmètre DIAMANT. Personne ne relève de TOPAZE ni de FORMAT, qui ont des droits globaux.",
    "- **Périmètre DIAMANT** : statut Candidat, ou une candidature ouverte, ou une date d'entrée de moins de `NEW_VOLUNTEER_MONTHS` mois (paramètre, 12 par défaut), ou un parrainage en cours comme filleul.",
    "- **Fonction confiée** : le profil figure dans `reference_items.managed_by` de la fonction (répartition par défaut, à confirmer : CHEF_PAPS et CDPE → ACTION ; CI et CI_SDIS → LASER ; CH_TECH, CH_FIXE, CH_MOBILE, CH_RESEAUX → ACTION et LASER ; ASSIST_FORM → FORMAT GP).",
    "- **Données sensibles** : naissance, adresse, personnes à prévenir, B3, autorisation parentale et documents. Elles ne se lisent que par `src/server/sensitive.ts`, qui journalise chaque consultation dans `access_logs`.",
    "",
  ].join("\n");
}
