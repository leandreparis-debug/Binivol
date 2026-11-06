# Tableaux de bord (étape 13)

L'accueil (`/`) montre un **bloc par profil** de la personne connectée (profils cumulables),
dans l'ordre stable des profils (TOPAZE, ACTION, LASER, FORMAT, FORMAT GP, DIAMANT), sans
doublon. Code : `src/server/services/dashboard.ts` (requêtes) et
`src/server/dashboard/aggregates.ts` (agrégats purs, testés sans base).

**Chaque bloc ne compte que ce que ce profil voit** : ses requêtes sont filtrées par
`visibleSql()` pour un acteur réduit à ce seul profil, avant de compter. Un compte FORMAT +
DIAMANT voit donc deux blocs, chacun avec ses propres chiffres.

| Profil    | Chiffres clés                                                                                | Liste « à faire »   | Graphiques                                                             |
| --------- | -------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------- |
| TOPAZE    | remplacé par le **tableau de bord DLUS** (étape 16, plus bas)                                |                     |                                                                        |
| DIAMANT   | relances échues, dossiers à contresigner, points de suivi à venir, nouveaux (< 12 mois)      | points de suivi     | entonnoir (candidats par étape, durée moyenne par étape), fidélisation |
| ACTION    | PSE valides, PSE qui expirent (60 j), tronc commun incomplet, équipiers disponibles (actifs) | échéances PSE       |                                                                        |
| LASER     | TCAU valides, CI et CI SDIS nommés, expirations à venir (formations LASER)                   | expirations         |                                                                        |
| FORMAT    | sessions à venir, résultats à reporter, personnes en liste d'attente                         | prochaines sessions | listes d'attente par formation                                         |
| FORMAT GP | formateurs et assistants actifs, recyclages FCPSE / FCCI à faire                             | recyclages          |                                                                        |

Sous les blocs : les derniers rappels et le nombre d'alertes du périmètre par priorité.

## Définitions

- **Entonnoir** : candidatures ouvertes par étape ; durée moyenne d'un passage dans l'étape
  (de l'entrée dans l'étape au changement suivant, ou à aujourd'hui pour l'étape en cours).
- **Fidélisation** : par cohorte trimestrielle d'entrée, la part des personnes encore là 12
  mois après **leur** entrée ; seules les cohortes dont les 12 mois sont écoulés (les 8
  dernières).
- **PSE1 / PSE2** : le référentiel n'a qu'une entrée `PSE` (comme l'ancien classeur) ; c'est
  elle qui est comptée.

## Graphiques

Faits main en SVG (`src/components/ui/BarChart.tsx`, ADR-059) : barres horizontales, série
secondaire hachurée (motif réservé aux données), titre, résumé textuel pour les lecteurs
d'écran, **tableau des données dépliable** (« Voir les données »), légende nommée (jamais la
couleur seule). Une seule `StatCard` mise en avant par écran : le premier chiffre du premier
bloc.

## Tableau de bord DLUS (TOPAZE, étape 16, ADR-069)

Le bloc TOPAZE de l'accueil devient une vue d'ensemble de l'unité, en trois zones
(`src/server/services/dlusDashboard.ts`, `src/app/(app)/DlusDashboard.tsx`, droit
`dashboard.dlus.read`). Les autres profils gardent leurs blocs, sans chiffre mis en avant (le
seul de l'écran est « Secouristes »). Tout est agrégé en SQL après `visibleSql()`, sans donnée
sensible.

### 1. Effectifs opérationnels

**Chaque chiffre ouvre l'annuaire filtré sur les personnes comptées**
(`/benevoles?indicateur=CLÉ`) : le chiffre est compté avec **les conditions mêmes de
l'annuaire** (`directoryConditions`, visibilité comprise), donc même filtre, même total (testé).

| Indicateur             | Définition retenue (paramètre `DASHBOARD_INDICATORS`)                                             |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| Secouristes (en avant) | actif avec PSE valide (`PSE`, ou `PSE1` / `PSE2` s'ils sont un jour ajoutés au référentiel)       |
| Bénurs                 | actif avec TCAU valide **et** sans PSE valide                                                     |
| Formateurs PSC         | actif avec FPSC valide                                                                            |
| Initiateurs GQS + IPS  | actif initiateur GQS (`I_GQS`) **ou** IPS (`I_IPS`) valide, compté une fois                       |
| Initiateurs IPSEN      | actif initiateur IPSEN (`I_IPSEN`) valide                                                         |
| Stagiaires formation   | actif inscrit à une session FPSC, FPSE, `I_GQS`, `I_IPS` ou `I_IPSEN` non terminée                |
| Stagiaires secours     | actif inscrit à une session PSE non terminée (un PSE valide qui prépare le niveau suivant compte) |

- **Actif** = statut ACTIVE (pause et suspension exclues). **Valide** = PASSED, non annulée,
  non expirée (la règle des périmètres). **Inscription en cours** = REGISTERED, non annulée,
  session non annulée dont la fin (ou le début) est aujourd'hui ou plus tard.
- Sous chaque chiffre : la **variation sur 12 mois** (« +4 depuis le 06/11/2025 » : à cette
  date, une personne comptait si elle était entrée et pas encore partie — les statuts ne sont
  pas historisés), et, pour les qualifications, le nombre qui **expire sous 60 jours**
  (`ALERT_DAYS_BEFORE_EXPIRY`) : comptées aujourd'hui, mais toutes leurs formations qui les font
  compter expirent dans ce délai. « dont PSE2 : n » n'apparaît que si le référentiel a `PSE2`.
- Paramètre : Paramètres de l'UL → « Tableau de bord DLUS » ; une ligne par indicateur
  « CLÉ | libellé | valide ou inscription | codes requis | codes exclus | dont X=CODES » ;
  **Aperçu** donne le nombre de chaque ligne avant d'enregistrer.

### 2. Dernières inscriptions en formation

Les 10 dernières : inscriptions (`training_records` REGISTERED, date = création) et listes
d'attente (souhaits WAITLISTED). Statut : **Inscrit**, **Liste d'attente**, **Confirmé**
(hypothèse : une inscription issue d'une liste d'attente, souhait planifié). Personne en
« Prénom NOM », lien vers la fiche si l'acteur peut l'ouvrir. « Tout voir » :
`/formations/sessions?inscriptions=recentes` (50 dernières).

### 3. Arrivées

- Sélecteur de période (`?periode=`) : 12 mois glissants, année civile, année précédente.
- Arrivées (date d'entrée) par mois, mois courant en accent, départs hachurés, solde dans le
  tableau dépliable (`FlowChart`).
- Arrivées depuis le 1er janvier et sur 12 mois ; **délai médian** du premier contact à la
  clôture « bénévole » (candidatures terminées en 12 mois) ; **taux de transformation** =
  terminées en bénévole / (terminées + abandonnées), candidatures closes en 12 mois.
- Entonnoir des candidatures ouvertes par étape, chaque étape liée à `/candidats?etape=`.
- Arrivées sur 12 mois par activité : la première formation à périmètre (ACTION → secours,
  LASER → urgence, FORMAT GP → formation), sinon les activités souhaitées, sinon « autre ».
- Fidélisation par cohorte (déplacée du bloc TOPAZE).

Mise en page : ordinateur = chiffres en haut, Arrivées (2/3) et Inscriptions (1/3) ;
tablette = deux colonnes ; téléphone = une colonne, chiffres en grille 2 × n.
