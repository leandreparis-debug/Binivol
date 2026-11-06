# Audit d'accessibilité (étape 15)

Référentiel visé : **WCAG 2.1 AA**.

## Ce qui est testé automatiquement

- **axe sur toutes les pages** (`e2e/a11y-pages.spec.ts`) : la liste est générée depuis
  `src/app` (une nouvelle page est auditée sans toucher au test), en bureau (1440 px) **et** à
  390 px. Aucune violation « serious » ou « critical » admise. Les pages du candidat (lien de
  dossier) et de relecture du dossier sont auditées par leurs propres parcours (`dossier`,
  `signature`, `candidates`).
- **axe dans chaque parcours** (dialogues ouverts compris) : candidats, Gaia, formations, suivi,
  alertes, réglages, tableaux de bord, matrice, purge, journaux, paramètres, confidentialité.
- **Clavier** : la matrice défile au clavier (zone focusable, en-têtes figés), la cloche s'ouvre
  et se ferme au clavier, les dialogues gardent le focus (Radix) ; cibles de 44 px au moins
  (test de l'accueil).
- **Mouvement réduit** : les tests tournent avec `prefers-reduced-motion: reduce` ; les
  transitions utilisent `motion-reduce:`.

## Corrigé pendant cette nuit

- Les actions d'un en-tête de page débordaient à 390 px (pilules et boutons) : retour à la ligne.
- Le panneau de la cloche cachait la page aux technologies d'assistance avec du contenu
  focusable dessous : il est désormais non modal.
- Le tableau des journaux, défilant horizontalement, n'était pas atteignable au clavier : zone
  focusable et nommée.
- Liens des listes (accueil, alertes, rappels) agrandis à 44 px de haut.
- Graphiques : SVG faits main avec titre, résumé textuel, tableau des données dépliable, légende
  nommée (jamais la couleur seule).

## Limites connues

- Pas d'audit manuel avec un lecteur d'écran (NVDA, VoiceOver) cette nuit : à faire avec un
  utilisateur concerné.
- Le contraste des graphiques hachurés repose sur la légende et le tableau ; il n'est pas mesuré
  automatiquement à l'intérieur du SVG.
- Un test d'axe sur la page 403 en mobile a échoué une fois (`html-has-lang`) puis passé à chaque
  nouvel essai : instabilité notée, à surveiller.
