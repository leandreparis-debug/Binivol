# Alertes et rappels (étape 12)

Deux mécanismes complémentaires, à ne pas confondre :

- les **alertes** sont des contrôles de qualité **calculés** sur les données du moment : rien
  n'est stocké, une alerte disparaît dès que la donnée est corrigée (`src/server/alerts/`) ;
- les **rappels** sont des notifications **datées**, produites chaque matin par des règles
  réglables (`ReminderRule` → `Notification`, la cloche ; `src/server/reminders/`).

## Règles d'alerte

Elles ne portent que sur les **présents** (candidat, actif, en pause, suspendu), sauf la purge
(parti dont la date de purge est passée). Chacune se désactive dans `/admin/reglages`
(`ALERT_RULES_DISABLED`).

| Priorité | Code                       | Règle                                                                      | Sujet       |
| -------- | -------------------------- | -------------------------------------------------------------------------- | ----------- |
| Haute    | `TRAINING_EXPIRED`         | Formation expirée (dernière réussite échue)                                | formations  |
| Haute    | `MINOR_FORBIDDEN_FUNCTION` | Mineur nommé à une fonction interdite aux mineurs                          | formations  |
| Haute    | `NIVOL_INVALID`            | Bénévole sans NIVOL ou NIVOL invalide                                      | TOPAZE      |
| Haute    | `INACTIVE_REFERENCE`       | Nomination en cours ou inscription à venir sur une entrée inactive         | formations  |
| Moyenne  | `TRAINING_EXPIRING`        | Formation qui expire dans `ALERT_DAYS_BEFORE_EXPIRY` (60 j)                | formations  |
| Moyenne  | `PREREQUISITE_MISSING`     | Compétence valide sans prérequis à jour                                    | formations  |
| Moyenne  | `MINOR_NO_PARENTAL_AUTH`   | Mineur sans autorisation parentale enregistrée                             | intégration |
| Moyenne  | `B3_DUE`                   | B3 non vérifié cette année (encadrant régulier de mineurs)                 | TOPAZE      |
| Moyenne  | `CORE_INCOMPLETE`          | Tronc commun incomplet (`CORE_TRAINING_CODES`), avec la date d'inscription | formations  |
| Moyenne  | `COMPANION_MISSING`        | « Compétence X exige Y » (`REQUIRED_COMPANIONS`, PSE → OPR, ECG)           | formations  |
| Moyenne  | `PURGE_DUE`                | Fiche à purger (`purgeEligibleAt` passé)                                   | TOPAZE      |
| Moyenne  | `CANDIDACY_FOLLOW_UP_LATE` | Relance de candidat échue                                                  | intégration |
| Moyenne  | `FOLLOW_UP_OVERDUE`        | Point de suivi en retard                                                   | intégration |
| Moyenne  | `PAUSE_RETURN_PASSED`      | Reprise de pause dépassée                                                  | intégration |
| Basse    | `RESULT_PENDING`           | Session passée encore « Inscrit(e) »                                       | formations  |
| Basse    | `PROFILE_INCOMPLETE`       | Fiche incomplète (e-mail, date de naissance, dates d'obtention)            | intégration |
| Info     | `REFERENCE_NO_VALIDITY`    | Formation sans durée de validité ni règle du 31/12                         | référentiel |

Un NIVOL **en double** est impossible : l'index unique de `persons.nivol` le refuse à
l'écriture (étape 2), il n'y a donc pas de règle pour lui. « Code inconnu » du référentiel est
de même impossible (clé étrangère) ; reste le code **inactif**.

## Qui voit quoi

La correspondance est dans la politique (`src/server/policy/alerts.ts`), pas dans l'écran :
chaque règle a un **sujet**, chaque sujet une action de la matrice, et l'alerte n'est montrée
que si `can()` l'autorise sur la personne (filtré **en SQL** par `visibleSql()`).

| Sujet       | Action                   | Profils                                                                        |
| ----------- | ------------------------ | ------------------------------------------------------------------------------ |
| formations  | `alert.training.read`    | TOPAZE ; FORMAT (hors candidats) ; ACTION, LASER, FORMAT GP sur leur périmètre |
| intégration | `alert.integration.read` | TOPAZE ; DIAMANT sur son périmètre                                             |
| TOPAZE      | `alert.admin.read`       | TOPAZE                                                                         |
| référentiel | `reference.manage`       | TOPAZE, FORMAT                                                                 |

## Affichage

- `/alertes` (sous « Rappels ») : regroupées par priorité, filtres priorité, règle,
  responsable (« Mes candidats » : responsable de la dernière candidature) ; un clic ouvre la
  fiche au bon onglet. `?personne=P-00012` limite à une personne.
- Le **nombre d'alertes** s'affiche dans l'annuaire (pastille près du nom) et en tête de la
  fiche (lien vers `/alertes?personne=…`).
- Calcul à la demande en sept requêtes groupées, sans N+1 ; testé à 500 personnes sous une
  seconde (`automation.db.test.ts`).
- Les faits sensibles nécessaires (âge, date du dernier B3, autorisation parentale) sortent
  de `sensitive.ts` sous forme dérivée, jamais l'issue du B3 ni la date de naissance (ADR-058).

## Règles de rappel

Réglables par TOPAZE (`/admin/reglages` : active, délai, profils destinataires). Un
destinataire ne reçoit un rappel que sur une personne qu'il peut voir pour ce sujet ; un
rappel de formation ne va à ACTION, LASER ou FORMAT GP que si la formation est de leur
périmètre.

| Règle               | Par défaut                                                             | Destinataires         |
| ------------------- | ---------------------------------------------------------------------- | --------------------- |
| `CANDIDACY_IDLE`    | Candidature sans action depuis 7 j                                     | DIAMANT               |
| `DOSSIER_UNSIGNED`  | Dossier envoyé, non signé après 5 j (+ relance du candidat par e-mail) | DIAMANT               |
| `TRAINING_EXPIRING` | Formation à échéance dans 60 j                                         | FORMAT, ACTION, LASER |
| `FOLLOWUP_DUE`      | Point de suivi arrivé                                                  | DIAMANT               |
| `PERSON_INACTIVE`   | Sans activité depuis 6 mois                                            | TOPAZE                |
| `B3_ANNUAL`         | En janvier, B3 à vérifier                                              | TOPAZE                |
| `PAUSE_RETURN`      | Reprise de pause arrivée                                               | DIAMANT               |
| `GREETINGS_REVIEW`  | Le 31/12, relire les textes d'anniversaire                             | TOPAZE                |

**Activité** (règle « sans activité ») : une session de formation (date de la ligne ou de la
session), une nomination (début) ou un point de suivi fait. Une personne entrée depuis moins
de 6 mois n'est pas concernée.

**Dédoublonnage** : `dedupeKey` = règle + objet + échéance (ex.
`TRAINING_EXPIRING:<personne>:<formation>:2026-12-31`), unique par destinataire en base :
jamais deux fois la même notification, même si la tâche est rejouée.

**Cloche** : nombre de non lus, panneau des 8 derniers, « Tout marquer comme lu », lien vers
`/rappels`.
