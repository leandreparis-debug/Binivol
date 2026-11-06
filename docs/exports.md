# Exports (étape 13)

Tous les exports sont des **CSV pour Excel en français** (`src/lib/csv.ts`) : UTF-8 avec BOM,
séparateur `;`, fins de ligne CRLF, dates `JJ/MM/AAAA`, nom de fichier daté
(`binivol-prefecture-2026-11-06.csv`). Guillemets, `;` et retours à la ligne sont échappés ;
une cellule qui commence par `=`, `+`, `-` ou `@` est préfixée d'une apostrophe (injection de
formule).

Chaque export est **écrit dans le journal des accès** (`access_logs`, portée `EXPORT`,
contexte `export:<type>:<n> lignes`) avant que le fichier parte, et passe par la route
`/api/exports/<type>` (session obligatoire, droits vérifiés par le service).

| Export     | Où                                   | Droit                                                               | Contenu                                                                                                                                                                                       |
| ---------- | ------------------------------------ | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Préfecture | `/admin/exports`                     | `person.export` (TOPAZE)                                            | bénévoles **actifs** avec une formation valide de `PREFECTURE_CODES` (PSE, FPSE) : nom, prénom, NIVOL, formation, date d'obtention, échéance. Bandeau « À vérifier dans Pegass avant envoi ». |
| Annuaire   | `/benevoles` (« Exporter la liste ») | `person.export`                                                     | la liste filtrée à l'écran ; colonnes non sensibles : référence, nom, prénom, NIVOL, statut, e-mail, téléphone, compétences                                                                   |
| Matrice    | `/formations/matrice`                | `training.matrix.export` (TOPAZE, FORMAT, ACTION, LASER, FORMAT GP) | la vue filtrée (catégorie), personnes du périmètre seulement ; symboles en clair                                                                                                              |

Jamais de donnée sensible dans un export (ni date de naissance, ni adresse, ni B3).

## Matrice des compétences

`/formations/matrice` : lignes = bénévoles présents du périmètre (`training.read`), colonnes =
formations actives du référentiel, filtre par catégorie (tronc commun, secours, formation
interne secours, grand public). Cellules depuis l'état unique de l'étape 10 : `✔` (valide),
`✔?` (valide, date inconnue), `Exp. JJ/MM`, `Expirée`, `Inscrit(e) JJ/MM`, vide ; chaque
cellule a un libellé complet (`aria-label`). En-têtes figés, zone défilable au clavier ; sur
téléphone, une carte par personne.
