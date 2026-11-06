# Journal de nuit — marathon V1 (étapes 8 à 15)

> **À lire d'abord.** Deux sessions ont travaillé en parallèle cette nuit :
>
> - une session « étape 8 seule » (branche `claude/quirky-johnson-9av6kd`), lancée vers 20 h, qui
>   a livré l'étape 8 et avancé `main` (`29e4618`) ;
> - cette session de marathon (branche `claude/binivol-v1-marathon-nuit-7yijue`, imposée par la
>   session), démarrée vers 20 h 15, qui a aussi fait l'étape 8 de son côté (commits `327d40d` à
>   `b9c313f`, suites vertes : 712 unit, 245 base, 86 e2e).
>
> Constat à 21 h 45 : `main` n'était plus un ancêtre de la branche. Rien n'a été forcé. Pour que
> les étapes suivantes restent fusionnables dans `main` et partent de ce qui est déployé, la
> branche a **adopté l'étape 8 de `main`** par un commit de fusion dont l'arbre est exactement
> celui de `main` (`70c5461`). L'étape 8 alternative de cette session reste lisible dans
> l'historique de la branche (comparaison possible : `git diff 29e4618 b9c313f`).

## Démarrage (05/11/2026)

- `main` (`78add07`) avancé en fast-forward à `803c137` au démarrage.
- Environnement : PostgreSQL 16 local (bases `binivol`, `binivol_test`, `binivol_e2e`),
  Chromium Playwright préinstallé.
- Suites de référence avant tout changement : 664 unit, 233 base, 86 e2e (34 ignorés par projet).
- Après adoption de `main` (`70c5461`) : 698 unit, 245 base verts.

| #   | Étape                                              | Statut                    |
| --- | -------------------------------------------------- | ------------------------- |
| 8   | Signature électronique et PDF officiels            | terminée (version `main`) |
| 9   | Assistant Gaia et passage au statut bénévole       | terminée                  |
| 10  | Formations, compétences et nominations             | terminée                  |
| 11  | Points de suivi, parrainage, B3, pauses et départs | terminée                  |
| 12  | Alertes, rappels et e-mails automatiques           | terminée                  |
| 13  | Tableaux de bord, matrice et exports               | terminée                  |
| 14  | RGPD et administration                             | terminée                  |
| 15  | Recette, audit et guides (sans VPS)                | à faire                   |

## Étape 8 — terminée (version de `main`)

Livrée par la session parallèle (`e6fcb9b` à `29e4618`). Son récapitulatif est dans ses propres
documents (`docs/signature.md`, `docs/decisions.md`). Points relevés par cette session lors de sa
propre version, utiles à vérifier sur celle de `main` :

- test instable de 0.4 : `src/server/dossier/__tests__/token.test.ts` (« refuses a tampered or
  malformed cookie ») échouait 1 fois sur 64 (premier caractère de la signature déjà « x ») ;
- la charte : `nom / qualité` et `numéro de téléphone` sont la **personne à prévenir** ;
- le dossier : `Prénom - 2` est le prénom répété en page 2 ;
- l'attestation : la ligne « Date » du bas réutilise les champs de date de naissance ;
- `seed:base` réécrivait les paramètres à chaque déploiement.

Chacun de ces points est revérifié sur la version de `main` dans l'étape 9 (« Corrections
préalables » ou section dédiée ci-dessous).

## Étape 9 — terminée

**Commits** : `2900a7a` (test instable de l'étape 8 corrigé : instant fixe), `05b62bc`
(`seed:base` ne réécrit plus les paramètres), `cae6210` (pas de copie de diplôme, ADR-049),
`5addc32` (migration et action `candidacy.finalize.undo`), `1544ae1` (services Gaia), puis
l'interface, le seed, les tests e2e et la documentation.

**Migration** : `20261108090000_gaia_checklist_and_followup_cancel` (`candidacies.gaia_checklist`,
`follow_ups.cancelled_at`, `cancelled_by_id`, `cancel_reason`, CHECK `follow_ups_cancel_reason`).

**Résultats** : `pnpm verify` 711 tests unitaires ; `pnpm test:db` 257 ; `pnpm test:e2e` 90
verts, 38 ignorés (ignorés par projet, comme avant). `pnpm db:fresh` passe.

**Ce qui existait déjà** (étape 6) : la clôture GAIA → DONE (NIVOL normalisé et doublon refusé
avec le nom, e-mail CRF, date d'entrée, statut ACTIVE, `CandidacyEvent`, point à 3 mois, une
transaction, parrainage conservé). L'étape 9 ajoute : la fiche Gaia à copier (lue à la demande,
journalisée « gaia »), la liste à cocher datée (`GAIA_CHECKLIST`), l'unicité de l'e-mail CRF,
l'attestation régénérée avec le NIVOL (ou « Compléter l'attestation »), l'annulation par TOPAZE
dans les 7 jours, l'étiquette et le filtre « À créer dans Gaia ».

**Captures** : `docs/captures/gaia-fiche-1440.png`, `gaia-nivol-1440.png`,
`candidats-gaia-1440.png`.

**Écarts, justifiés** :

- **Seed** : un seul candidat à « Création Gaia » (liste à moitié cochée), pas de second à liste
  vide (ajouter une personne change les comptes de l'annuaire vérifiés partout) ; la clôture
  récente est une personne intégrée dont la clôture date de 2 jours (annulable par TOPAZE).
- **Unicité de l'e-mail CRF** par le service, pas par un index (risque d'échec de migration en
  production sur une base existante) : `docs/nuit/questions.md`.
- **Nationalité** : non recueillie par le dossier, affichée « À demander ».
- La saisie du résultat reste la boîte « Finaliser l'intégration » de l'étape 6 (déjà
  conforme), au lieu d'un nouveau formulaire dans le bloc Gaia.

## Étape 10 — terminée

**Commits** : `7c571c1` + `f1de650` (état unique et avertissements), `6892717` (services ; le
seed de base ne réécrit plus le référentiel), `fe07088` (pages `/formations` et outils de la
fiche ; `reference.manage` donné à FORMAT), puis seed, e2e, captures et documentation.

**Migration** : aucune (le modèle de l'étape 2 suffisait).

**Résultats** : `pnpm verify` 739 tests unitaires ; `pnpm test:db` 265 ; `pnpm test:e2e` 93
verts, 38 ignorés (ignorés par projet). `pnpm db:fresh` passe.

**Captures** : `formations-sessions-1440.png`, `formations-saisie-1440.png`,
`formations-trouver-1440.png`, `fiche-formations-etape10-1440.png`.

**Écarts, justifiés** :

- `trainingSummary.ts` (pastilles et échéances de l'annuaire) est conservé : il calcule déjà
  les échéances selon la même règle et son SQL (`deadlineSql`) est testé contre l'état pur sur
  le seed. Les nouveaux écrans (Trouver, avertissements) lisent `qualification.ts`.
- « Une expiration dans 30 jours » du seed a une échéance posée (aucune entrée du référentiel
  n'a de validité en mois).
- `reference.manage` était TOPAZE seul ; le cahier le donne aussi à FORMAT : matrice changée,
  `docs/permissions.md` régénéré.
- Le lien entre deux entrées du référentiel (prérequis) est une ligne de configuration sans
  historique : retirer un prérequis la supprime, l'opération est auditée.

## Étape 11 — terminée

**Commits** : `c98b4ad` (migration, règles pures des statuts, pause, départ qui clôt nominations
et parrainages, retour d'un ancien), `2b99737` (points de suivi, tableau `/candidats/suivi`,
parrainages, B3 réservé à TOPAZE, seed), puis e2e, captures, documentation.

**Migration** : `20261109090000_pause_and_b3_checker` (`persons.paused_at`, `pause_until`,
`pause_reason` + CHECK `persons_pause_dates` ; `person_sensitive.b3_checked_by_id`).

**Résultats** : `pnpm verify` 769 tests unitaires ; `pnpm test:db` 270 ; `pnpm test:e2e` 95
verts, 38 ignorés (ignorés par projet). `pnpm db:fresh` passe.

**Captures** : `docs/captures/fiche-suivi-1440.png`, `suivi-liste-1440.png`, `depart-1440.png`.

**Documentation** : `docs/suivi.md`, ADR-054 (pas de copie du casier, rétention), ADR-055
(compte rendu non sensible, liste dans `/candidats/suivi`), `docs/permissions.md` régénéré
(`person.return`, `b3.manage`).

**Écarts, justifiés** :

- Liste des points : section `/candidats/suivi` (choix laissé par le cahier).
- Le retour d'un ancien par DIAMANT passe par un bouton dédié (`person.return`) : DIAMANT n'a pas
  `person.status.change`.
- Correction annexe : les actions d'un `PageHeader` débordaient à 390 px quand elles sont
  nombreuses (`max-w-full`), relevé par l'e2e de navigation mobile.
- Les schémas Zod des actions de suivi sont dans `src/lib/followUpForms.ts` (un fichier
  `"use server"` ne peut exporter que des fonctions asynchrones).

## Étape 12 — terminée

**Commits** : `80db74b` (moteurs d'alertes et de rappels, e-mails automatiques, route
protégée), `7704d9b` (tests base), `dbf4119` (écrans, seed), puis accueil, e2e, captures et
documentation.

**Migration** : `20261110090000_alerts_reminders_jobs` (`persons.greeting_opt_out`,
`job_runs` + unique `(job, day)`, `automated_messages`, déclencheurs `PAUSE_RETURN` et
`GREETINGS_REVIEW`, délais par défaut de l'étape 12 là où ceux de l'étape 2 n'avaient pas
changé).

**Résultats** : `pnpm verify` 832 tests unitaires ; `pnpm test:db` 277 ; `pnpm test:e2e` 98
verts, 38 ignorés (par projet). `pnpm db:fresh` passe ; chacune des 17 règles d'alerte a un cas
dans le seed (vérifié par un test).

**Captures** : `docs/captures/alertes-1440.png`, `cloche-1440.png`, `reglages-1440.png`.

**Documentation** : `docs/alertes.md`, `docs/taches.md`, `docs/mail.md` complété, ADR-056 à
ADR-058, `.env.example` (`CRON_SECRET`, sans valeur), `docs/permissions.md` régénéré.

**À faire par Léandre** : créer `CRON_SECRET` dans Vercel (Production) ; sans elle, la tâche
quotidienne refuse tout (c'est voulu).

**Écarts, justifiés** :

- NIVOL en double et code inconnu du référentiel : impossibles par construction (index unique,
  clé étrangère) ; pas de règle, documenté.
- Permissions : trois actions nouvelles (`alert.training.read`, `alert.integration.read`,
  `alert.admin.read`) portent la correspondance sujet → profils dans la matrice.
- Le récapitulatif TCAU est réservé à TOPAZE et FORMAT.
- Correction annexe : la cloche était un bouton inerte ; l'accueil affichait « à l'étape 12 ».
- `GREETING_EMAILS_ENABLED` vaut désormais `false` par défaut (le cahier le demande).

## Étape 13 — terminée

**Commits** : `6f091d2` (correctif : un `CRON_SECRET` trop court est refusé par la route au lieu
d'empêcher le démarrage), `1bacf40` (accueil par profil, matrice, exports), puis seed,
documentation, e2e et captures.

**Migration** : aucune (le journal des accès porte déjà la portée `EXPORT`).

**Résultats** : `pnpm verify` 846 tests unitaires ; `pnpm test:db` 284 ; `pnpm test:e2e` 103
verts, 39 ignorés (par projet). `pnpm db:fresh` passe.

**Captures** : `accueil-topaze-1440.png`, `accueil-diamant-1440.png`, `accueil-action-1440.png`,
`accueil-laser-1440.png`, `accueil-format-1440.png`, `accueil-format-gp-1440.png`,
`matrice-1440.png`.

**Documentation** : `docs/tableaux-de-bord.md`, `docs/exports.md`, ADR-059 (graphiques SVG
faits main) et ADR-060 (exports journalisés, CSV neutralisé), `docs/permissions.md` régénéré
(`training.matrix.export`).

**Écarts, justifiés** :

- PSE1 / PSE2 : le référentiel n'a qu'une entrée `PSE` ; c'est elle qui est comptée (accueil
  ACTION, export préfecture : `PREFECTURE_CODES` = PSE, FPSE, réglable).
- Le composant `HatchedBarChart` de l'étape 1 (barres verticales en `div`) est conservé pour
  le design system ; l'accueil utilise `BarChart`, en SVG comme le demande le cahier.
- Seed : deux départs moins d'un an après l'entrée (cohortes de fidélisation lisibles) ; le
  seed avait déjà 3 ans d'arrivées et des candidats à chaque étape.
- La durée moyenne par étape du seed est souvent 0 j (les événements fictifs datent de la
  création) : le calcul est testé à part.
- Accueil : les chiffres codés en dur de l'étape 1 sont remplacés par les blocs réels.

## Étape 14 — terminée

**Commits** : `f987b1a` (purge), `7862d68` (page de purge, export RGPD), `0c61f74` (journaux),
`6585495` (paramètres, confidentialité, sauvegardes, menu), puis documentation, captures.

**Migration** : `20261111090000_storage_orphans` (fichiers dont la suppression a échoué
pendant une purge, retentés ensuite).

**Résultats** : `pnpm verify` 870 tests unitaires ; `pnpm test:db` 293 ; `pnpm test:e2e` 107
verts, 39 ignorés (par projet). `pnpm db:fresh` passe. `db:backup` (3 copies, rotation à 2),
`db:restore` sur la base locale et refus d'un hôte distant vérifiés à la main.

**Captures** : `purge-1440.png`, `journaux-1440.png`, `parametres-1440.png`,
`confidentialite-1440.png`.

**Documentation** : `docs/rgpd.md` (registre en brouillon à faire valider par le DPO, droits,
purge, journaux), `docs/sauvegarde.md`, ADR-061 à ADR-063, `docs/permissions.md` régénéré
(`person.purge`, `person.gdprExport`), `.env.example` (`BACKUP_ENCRYPTION_KEY`, `BACKUP_DIR`,
`BACKUP_KEEP`, sans valeur).

**Écarts, justifiés** :

- Le cahier cite `BACKUP_KEEP` (8) : c'est une variable d'environnement du script ; le
  paramètre `BACKUPS_TO_KEEP` (12) de l'étape 2, jamais utilisé, est laissé tel quel.
- La purge supprime aussi les images de signature (stockées), oubliées par le cahier.
- La page de confidentialité affiche `RGPD_NOTICE` (un seul texte, déjà marqué « BROUILLON ») ;
  l'adresse de contact est le nouveau paramètre `UL_CONTACT_EMAIL` (vide par défaut).
- Un test e2e d'accessibilité (page 403 sur mobile) a échoué une fois (`html-has-lang`) puis
  passé 3 fois de suite seul et dans la suite complète : instabilité notée, test non modifié.
