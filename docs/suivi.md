# Suivi des bénévoles (étape 11)

Points de suivi, parrainages, attestation B3, pauses, départs et retours. Les règles pures sont
dans `src/server/statusRules.ts` (testées par `src/server/__tests__/statusRules.test.ts`), les
services dans `src/server/services/followUps.ts`, `personWrites.ts` (`changePersonStatus`) et
`src/server/sensitive.ts` (B3).

## Points de suivi

- Le **point à 3 mois** est planifié à la clôture Gaia (étape 9).
- **Compléter un point** (onglet Suivi de la fiche, `followUp.manage` : DIAMANT, TOPAZE) : date,
  mené par (la personne connectée), compte rendu court (2 000 caractères au plus) et prochaine
  date, par défaut **l'anniversaire de la date d'entrée** qui suit le point (`nextAnniversary`,
  29/02 → 28/02). Si aucun autre point n'est prévu, un **point annuel** est créé à cette date.
  Un point déjà complété ne peut pas l'être deux fois (écriture conditionnelle).
- Le compte rendu n'est **pas sensible** mais n'apparaît **dans aucune liste** (ADR-055).
- **Liste** : `/candidats/suivi` (bouton « Suivi des bénévoles » de `/candidats`). Trois colonnes :
  en retard (pastille rouge + « En retard »), cette semaine, ce mois-ci ; filtre « Mes
  candidats » (responsable de la dernière candidature). Filtrée en SQL par `visibleSql()`.
  Seules les personnes actives ou en pause y figurent.

## Parrainages

- Tableau des parrainages en cours sur `/candidats/suivi` : filleul, parrain, depuis, dernier
  point fait ; bouton « Terminer » (date de fin, note).
- Un parrain ne peut pas être son propre filleul et doit être présent (actif ou en pause)
  (`mentorProblem`).
- Après `NEW_VOLUNTEER_MONTHS` mois (12 par défaut), « Fin proposée » s'affiche : la fin n'est
  jamais imposée (`mentorshipEndSuggested`).

## Attestation B3 (encadrants réguliers de mineurs)

- **Aucune copie du casier** (ADR-054) : date, issue (`CLEAR` / `FLAGGED`), vérificateur, dans
  `PersonSensitive`. Dépôt d'un document `B3_ATTESTATION` refusé.
- Saisie par TOPAZE seul (`b3.manage`), une par année civile (`b3Due`).
- `FLAGGED` n'est lisible que par TOPAZE ; les autres voient « issue réservée à TOPAZE ». Chaque
  lecture passe par `readPersonSensitive` (journalisée dans `access_logs`).
- L'audit (`field = "b3Check"`) ne retient que la date ; la frise affiche « B3 vérifié » sans
  l'issue.
- Liste « B3 à vérifier cette année » (TOPAZE) sur `/candidats/suivi`.

## Pauses, départs et retours

Le changement de statut de l'étape 5 est réutilisé (« Changer le statut » de la fiche) ; ses
transitions sont décidées par `decideStatusChange` :

| Transition          | Exigences                                                                                                                                                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| → `PAUSED`          | début (par défaut aujourd'hui), reprise prévue et motif facultatifs                                                                                                                              |
| `PAUSED` → `ACTIVE` | reprise : dates de pause effacées, tracée                                                                                                                                                        |
| → `LEFT`            | date et motif ; nominations terminées et parrainages clos à cette date (cases cochées par défaut), dans la même transaction ; `purgeEligibleAt` = départ + `RETENTION_YEARS_AFTER_LEAVE` ans (5) |
| `LEFT` → `ACTIVE`   | « Retour d'un ancien », motif obligatoire ; `purgeEligibleAt` effacé. TOPAZE (changement de statut) et DIAMANT (`person.return`, bouton « Retour d'un ancien »)                                  |

Une personne candidate ne change de statut que par son intégration ; un retour au statut
candidat est refusé. La reprise prévue d'une pause donnera un rappel à l'étape 12.

## Frise chronologique

Points de suivi, début et fin de parrainage, « B3 vérifié » (sans l'issue), pauses, départ et
« Retour d'un ancien bénévole » apparaissent dans l'onglet Historique.

## Seed de démonstration

Points en retard et à venir, un parrainage de 13 mois, un encadrant de mineurs sans B3 cette
année, une personne en pause dont la reprise est passée, une personne partie depuis 6 ans
(éligible à la purge), un retour d'ancien.
