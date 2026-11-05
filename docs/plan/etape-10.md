## Étape 10 — Formations, compétences et nominations

### 0. Corrections préalables

Aucune. Cette étape ne dépend que de l'étape 5 : si 8 ou 9 sont `partielles`, fais-la quand
même.

### Contexte

`/formations` est encore une page d'attente. Le modèle existe : `ReferenceItem`
(formations et fonctions, `validityMonths`, `expiresEndOfYear`, `forbiddenForMinors`,
prérequis, `managedBy`), `TrainingSession`, `TrainingRecord` (résultat, `expiresAt` calculé
par `src/server/reference.ts`), `TrainingWish`, `Appointment`. La fiche affiche déjà un
résumé (`src/server/trainingSummary.ts`). Permissions existantes : `training.read`,
`training.write`, `appointment.read`, `appointment.write`, `reference.manage`.

Rappels métier :

- **Pegass fait foi** pour les diplômes et l'aptitude : Binivol reflète, il ne délivre rien.
- Aucune formation n'a de validité en mois dans le référentiel réel ; seules FCPSE et FCCI
  expirent au **31/12 de l'année d'obtention**. Le moteur gère quand même les deux règles.
- Les nominations sont faites par les profils de `managedBy` (CHEF_PAPS et CDPE par ACTION,
  CI et CI_SDIS par LASER, CH_* par les deux, ASSIST_FORM par FORMAT GP), et TOPAZE.

### Objectif

#### 1. État unique par compétence (fonction pure, `src/server/qualification.ts`)

Pour une personne et une entrée du référentiel, un seul état, repris de l'ancien outil :

| État                                       | Règle                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `VALID` « Valide »                         | session réussie la plus récente avec date, non expirée                             |
| `VALID_UNDATED` « Valide (date inconnue) » | réussie, sans date d'obtention                                                     |
| `EXPIRING` « Expire bientôt »              | valide, échéance dans le délai d'alerte (`ALERT_DAYS`, 60 j par défaut, `Setting`) |
| `EXPIRED` « Expirée »                      | échéance passée                                                                    |
| `REGISTERED` « Inscrit(e) »                | inscription à une session future, sans réussite valide                             |
| `TO_CONFIRM` « À confirmer »               | résultat `TO_CONFIRM`                                                              |
| `FUNCTION_ACTIVE` / `FUNCTION_ENDED`       | pour les fonctions : nomination en cours ou terminée                               |
| `NONE`                                     | rien                                                                               |

- La **session réussie la plus récente** compte ; les lignes annulées sont ignorées.
- Une inscription à une session passée encore `REGISTERED` est « résultat à reporter ».
- Remplace la logique dupliquée de `trainingSummary.ts` par ce module, et garde une seule
  source pour l'annuaire, la fiche, Trouver et la matrice (étape 13). Le SQL de l'annuaire
  (`deadlineSql`) doit rester cohérent : teste-le contre la fonction pure sur le seed.
- Pastille + libellé pour chaque état (`src/lib/status.ts`), jamais la couleur seule.

#### 2. Page `/formations` (sous-navigation en pilules)

- **Sessions** : liste (à venir / passées), création (formation, dates, lieu, lien Pegass,
  capacité), annulation tracée avec motif. Une session ouvre sa page : inscrits, résultats,
  liste d'attente.
- **Saisie de groupe** (reprise de l'ancien outil) : une formation, une date, un résultat,
  puis des cases à cocher sur la liste des personnes du périmètre (recherche, filtre). Les
  avertissements (point 5) sont calculés **pour tout le groupe en une fois** et affichés
  avant l'enregistrement.
- **Résultats** : `REGISTERED` → `PASSED`, `FAILED`, `ABSENT` ou `TO_CONFIRM`, un par un ou en
  lot ; `expiresAt` recalculé à chaque changement.
- **Listes d'attente** : les souhaits (`TrainingWish`) par formation, triés par priorité puis
  ancienneté ; « Inscrire à une session » transforme un souhait en inscription (`SCHEDULED`
  puis `DONE` quand le résultat est `PASSED`).
- **Référentiel** (`reference.manage`, TOPAZE et FORMAT) : édition des libellés, catégorie,
  validité, 31/12, interdit aux mineurs, prérequis, `managedBy`, actif. Jamais de suppression.
- **Trouver** (reprise de l'ancien outil, indispensable pour monter une équipe) :
  - jusqu'à 3 compétences **valides** exigées (ET), plus une recherche par nom ;
  - seulement les présents (`ACTIVE`, `PAUSED`), **hors suspendus** ;
  - résultat en cartes : nom, compétences demandées avec leur état, téléphone et e-mail
    **cliquables** (`tel:`, `mailto:`) ;
  - bouton « Copier les e-mails » (séparés par `;`) ;
  - respecte la visibilité (`visibleSql`), filtre en SQL avant de compter ;
  - le téléphone et l'e-mail ne sont pas des données sensibles au sens de `PersonSensitive` :
    vérifie-le dans le schéma ; s'ils le sont, passe par `readPersonSensitive`.

#### 3. Fiche bénévole, onglet Formations

- Liste par catégorie avec l'état unique, l'échéance et l'historique dépliable.
- Ajouter une session (un résultat) ; annuler une ligne (motif) ; ajouter un souhait.

#### 4. Nominations (onglet Fonctions de la fiche)

- Nommer : fonction, date de début, autorisé par, référence de décision, commentaire.
  Seuls les profils de `managedBy` de la fonction et TOPAZE (via la politique, jamais un test
  de profil dans le code).
- Terminer (date de fin) ; annuler (motif) ; historique.
- **Mineur et fonction interdite aux mineurs : refus bloquant** à la création. Les lignes
  importées qui violent la règle restent, et l'étape 12 les signalera.

#### 5. Contrôles qui avertissent sans bloquer

Philosophie de l'ancien outil : **on ne bloque pas le terrain**. Seules les vraies erreurs
bloquent (champ obligatoire, format, date de fin avant le début, mineur et fonction
interdite). Le reste est un **avertissement** affiché avant l'enregistrement, avec
« Enregistrer quand même » (et la liste des avertissements acceptés écrite dans l'audit) :

- date de réussite dans le futur ;
- prérequis manquant (non valide à la date de la session) ;
- doublon de session (même personne, même formation, même date) ;
- nomination sans « autorisé par » ;
- personne non présente (candidat, parti) ;
- session complète (capacité dépassée).
  Écris un module pur `src/server/warnings.ts`, réutilisable ailleurs.

### Seed

Des sessions passées et futures, une saisie de groupe, des états de chaque sorte (dont une
expiration dans 30 jours, une expirée, une sans date, un résultat à reporter), des listes
d'attente, des nominations actives et terminées, un mineur avec une nomination importée
interdite.

### Tests attendus

- Vitest : chaque état de compétence (table de cas), 31/12 et validité en mois, ignore les
  lignes annulées, la plus récente gagne ; chaque avertissement ; tri des listes d'attente.
- `test:db` : saisie de groupe (avertissements groupés, transaction) ; Trouver (ET sur 3
  compétences, hors suspendus, visibilité) ; nominations et droits par `managedBy` ; refus
  mineur ; cohérence `deadlineSql` et fonction pure ; annulations tracées.
- Playwright : FORMAT saisit une formation de groupe de 5 personnes avec un avertissement
  accepté ; ACTION trouve une équipe PSE1 + PSC et copie les e-mails ; LASER nomme un CI ;
  axe sans violation sur chaque page.

### Documentation

`docs/formations.md` (états, avertissements, Trouver, listes d'attente), ADR (état unique,
avertir sans bloquer), `docs/permissions.md` régénéré, captures.

### Récapitulatif (dans le journal)

Migrations, tests, écarts, captures (sessions, saisie de groupe, Trouver, onglet Formations).
