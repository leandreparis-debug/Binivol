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
| TOPAZE    | bénévoles actifs, alertes hautes, B3 à vérifier, fiches à purger                             | alertes hautes      | effectif par statut, arrivées et départs (12 mois), fidélisation       |
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
