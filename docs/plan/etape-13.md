## Étape 13 — Tableaux de bord, matrice et exports

### 0. Corrections préalables

Dépend de l'étape 12 (les alertes alimentent les accueils). Relis `docs/design-system.md` :
une seule `StatCard variant="highlight"` par écran, hachures réservées aux données, statut =
pastille + libellé.

### Objectif

#### 1. Accueil par profil (`/`)

L'accueil montre les blocs de **chacun des profils** de l'utilisateur (profils cumulables),
dans un ordre stable, sans doublon. Chaque bloc : 3 ou 4 chiffres clés et une liste courte
« à faire » qui renvoie vers la page détaillée.

| Profil    | Chiffres et listes                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TOPAZE    | effectif par statut ; alertes Hautes ; arrivées et départs sur 12 mois ; B3 à vérifier ; fiches à purger                                                               |
| DIAMANT   | **entonnoir de recrutement** (candidats par étape, durée moyenne par étape) ; relances échues ; dossiers à contresigner ; points de suivi à venir ; nouveaux < 12 mois |
| ACTION    | PSE1/PSE2 valides, qui expirent sous 60 j ; tronc commun incomplet ; équipiers disponibles (présents hors suspendus)                                                   |
| LASER     | TCAU valides ; CI et CI_SDIS nommés ; expirations à venir                                                                                                              |
| FORMAT    | sessions à venir ; résultats à reporter ; listes d'attente par formation                                                                                               |
| FORMAT GP | formateurs et assistants actifs ; recyclages FCPSE/FCCI à faire avant le 31/12                                                                                         |

- **Fidélisation** (TOPAZE, DIAMANT) : part des bénévoles encore actifs 12 mois après leur
  entrée, par cohorte trimestrielle (barres hachurées).
- Graphiques **faits main en SVG** (pas de bibliothèque lourde), accessibles : titre, résumé
  textuel, tableau de données dépliable, contraste AA, pas de couleur seule.
- Données agrégées en SQL, filtrées par `visibleSql` avant de compter.

#### 2. Matrice compétences (`/formations/matrice`, reprise de l'ancien outil)

- Lignes : bénévoles présents du périmètre ; colonnes : formations du référentiel ; filtre
  par catégorie (tronc commun, secours, formation IS, grand public).
- Cellules, depuis l'état unique de l'étape 10 : `✔` (valide), `✔?` (valide, date inconnue),
  `Exp. JJ/MM` (expire bientôt), `Expirée`, `Inscrit(e) JJ/MM`, vide. Chaque cellule a un
  libellé accessible complet (`aria-label`), pas seulement le symbole.
- En-têtes de lignes et de colonnes figés au défilement ; utilisable au clavier ; sur mobile,
  une vue par personne à la place du tableau.
- Export CSV de la vue filtrée.

#### 3. Exports

Tous les exports : CSV UTF-8 avec BOM et `;` (ouverture directe dans Excel en français),
dates `JJ/MM/AAAA`, nom de fichier daté, **écrits dans l'`AccessLog`** (qui, quand, combien de
lignes), réservés aux profils autorisés par la politique (`person.export` ou une permission
dédiée).

- **Export préfecture** (obligation annuelle) : présents actifs avec **PSE1 ou PSE2 valide**,
  ou **FPSE valide** (codes dans un `Setting`). Colonnes : nom, prénom, NIVOL, formation,
  date d'obtention, échéance. Un bandeau rappelle : « À vérifier dans Pegass avant envoi ».
- **Annuaire filtré** : la liste visible, colonnes non sensibles seulement.
- **Matrice** : voir plus haut.

### Seed

Assez de données pour des graphiques lisibles : 60 personnes fictives sur 3 ans d'arrivées,
des candidats à chaque étape.

### Tests attendus

- Vitest : agrégats purs (entonnoir, cohortes), symboles de la matrice, génération CSV (BOM,
  `;`, échappement des guillemets et des retours à la ligne, injection de formule : une cellule
  qui commence par `=`, `+`, `-` ou `@` est préfixée d'une apostrophe).
- `test:db` : chaque accueil par profil ne compte que ce qu'il voit ; export préfecture
  (bonnes personnes, `AccessLog` écrit) ; refus d'export sans permission.
- Playwright : un compte multi-profils voit les blocs de ses profils ; la matrice au clavier ;
  téléchargement de l'export préfecture ; axe sans violation (accueil, matrice).

### Documentation

`docs/tableaux-de-bord.md`, `docs/exports.md`, ADR (graphiques SVG faits main), captures de
chaque accueil et de la matrice.

### Récapitulatif (dans le journal)

Tests, écarts, captures.
