## Étape 11 — Points de suivi, parrainage, B3, pauses et départs

### 0. Corrections préalables

Dépend des étapes 6 et 10. Si 10 est `partielle`, fais ce qui ne dépend pas d'elle et note le
reste.

### Contexte

Le modèle existe : `FollowUp` (`THREE_MONTHS`, `ANNUAL`, `OTHER`), `Mentorship`,
`Person.status` (`ACTIVE`, `PAUSED`, `SUSPENDED`, `INACTIVE`, `LEFT`), `leftAt`,
`leftReason`, `PersonSensitive` (dont le B3), `regularMinorSupervisor`. Le changement de
statut avec motif existe depuis l'étape 5 : réutilise-le, ne le duplique pas.

### Objectif

1. **Points de suivi** (onglet Suivi de la fiche, DIAMANT et TOPAZE) :
   - le point à 3 mois est créé à la clôture Gaia (étape 9) ; ensuite un point **annuel** à la
     date anniversaire d'entrée ;
   - compléter un point : date, mené par, compte rendu court (texte, 2 000 caractères au
     plus, jamais affiché dans une liste), prochaine date proposée (par défaut + 1 an) ;
   - liste `/suivi` (ou une section de `/candidats` si plus cohérent avec la navigation
     existante ; décide et note-le) : points en retard, de la semaine, du mois, filtrables par
     responsable ;
   - un point en retard est mis en évidence (pastille + libellé).
2. **Parrainage** :
   - tableau des parrainages en cours : filleul, parrain, depuis, dernier point ;
   - terminer un parrainage (date de fin, note) ; un parrain ne peut pas être son propre
     filleul ; un parrain doit être présent ;
   - fin automatique proposée (pas imposée) au bout de 12 mois (`NEW_VOLUNTEER_MONTHS`).
3. **Attestation B3** (casier judiciaire, bulletin n° 3) pour les **encadrants réguliers de
   mineurs** (`regularMinorSupervisor`) :
   - **Binivol ne stocke jamais de copie du casier** : on enregistre seulement la date de
     vérification, l'issue (`CLEAR` ou `FLAGGED`) et qui a vérifié, dans `PersonSensitive`,
     lecture journalisée ;
   - une vérification par année civile ; liste « B3 à vérifier cette année » pour TOPAZE ;
   - `FLAGGED` n'est visible que par TOPAZE ;
   - refuse le dépôt d'un document `B3_ATTESTATION` (même règle que les diplômes) et
     documente-le.
4. **Pauses et départs** :
   - **pause** (`PAUSED`) avec date de début, date de reprise prévue et motif court ; la
     personne reste dans l'annuaire avec une pastille ; à la date de reprise, l'étape 12
     créera un rappel ;
   - **reprise** : retour à `ACTIVE`, tracée ;
   - **départ** (`LEFT`) : date, motif (`LeftReason`), commentaire ; à la validation,
     proposer de **terminer les nominations en cours** et de **clore les parrainages**
     (cases cochées par défaut) ; calcule `purgeEligibleAt` = départ + `RETENTION_YEARS`
     (5 ans par défaut, `Setting`) ;
   - **retour d'un ancien** : `LEFT` → `ACTIVE` possible pour TOPAZE et DIAMANT, avec motif ;
     `purgeEligibleAt` effacé.
5. **Frise chronologique** : tous ces événements y apparaissent (points de suivi, début et
   fin de parrainage, B3 vérifié sans l'issue, pauses, départ, retour).

### Règles

- Données sensibles (compte rendu de suivi ? non ; issue du B3 : oui) : décide pour le compte
  rendu (recommandé : non sensible, mais jamais en liste) et note-le.
- Transitions de statut : une fonction pure testée, comme pour la machine des candidatures,
  si elle n'existe pas déjà.

### Seed

Points de suivi en retard et à venir, un parrainage de 13 mois, un encadrant de mineurs sans
B3 cette année, une personne en pause dont la reprise est passée, un parti depuis 6 ans
(éligible à la purge, pour l'étape 14), un retour d'ancien.

### Tests attendus

- Vitest : transitions de statut, calcul des dates (annuel, rétention), règles du parrainage.
- `test:db` : départ avec fin des nominations et des parrainages en une transaction ; B3 (une
  par année, `FLAGGED` visible par TOPAZE seul, lecture journalisée) ; retour d'un ancien.
- Playwright : DIAMANT complète un point à 3 mois ; TOPAZE enregistre un départ ; axe sans
  violation.

### Documentation

`docs/suivi.md`, ADR (pas de copie du casier, rétention), `docs/permissions.md` si besoin.

### Récapitulatif (dans le journal)

Migrations, tests, écarts, captures (onglet Suivi, liste des points, départ).
