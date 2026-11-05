# Formations, compétences et nominations (étape 10)

**Pegass fait foi** pour les diplômes et l'aptitude : Binivol reflète ce qui y figure, il ne
délivre rien. Le code est dans `src/server/qualification.ts` (états), `src/server/warnings.ts`
(avertissements), `src/server/services/trainings.ts` (écritures et lectures) et les écrans
`/formations` et onglets Formations et Fonctions de la fiche.

## État unique par compétence

Une seule fonction pure (`trainingState`, `functionState`) donne, pour une personne et une entrée
du référentiel, un état repris de l'ancien outil (ADR-052). Pastille et libellé (`StatusDot`,
`qual-*` dans `src/lib/status.ts`), jamais la couleur seule.

| État              | Libellé                | Règle                                                                      |
| ----------------- | ---------------------- | -------------------------------------------------------------------------- |
| `VALID`           | Valide                 | réussite la plus récente, datée, non expirée                               |
| `VALID_UNDATED`   | Valide (date inconnue) | réussite sans date d'obtention                                             |
| `EXPIRING`        | Expire bientôt         | valide, échéance dans le délai d'alerte (`ALERT_DAYS_BEFORE_EXPIRY`, 60 j) |
| `EXPIRED`         | Expirée                | échéance passée                                                            |
| `REGISTERED`      | Inscrit(e)             | inscription, sans réussite valide                                          |
| `TO_CONFIRM`      | À confirmer            | résultat « À confirmer »                                                   |
| `FUNCTION_ACTIVE` | Fonction en cours      | nomination qui couvre le jour                                              |
| `FUNCTION_ENDED`  | Fonction terminée      | seulement des nominations terminées                                        |
| `NONE`            | Aucune                 | rien                                                                       |

- Les lignes **annulées** sont ignorées ; la **réussite la plus récente** compte (une
  réussite datée passe avant une non datée).
- Une inscription à une session **passée**, toujours « Inscrit », est un **résultat à
  reporter** (`pendingResult`).
- Échéance : `computeExpiresAt` (`src/server/reference.ts`) : validité en mois et/ou 31/12. Dans le
  référentiel réel, seules FCPSE et FCCI expirent au 31/12 de l'année d'obtention ; le moteur
  gère les deux règles. Modifier la validité d'une entrée recalcule les lignes en cours.
- Le SQL des échéances de l'annuaire (`deadlineSql`) est testé contre l'état pur sur le seed.

## Avertir sans bloquer (ADR-053)

On ne bloque pas le terrain. Seules les vraies erreurs bloquent : champ obligatoire, format,
date de fin avant le début, personne hors périmètre, **mineur et fonction interdite aux
mineurs**. Le reste est un **avertissement** affiché avant l'enregistrement, avec « Enregistrer
quand même » ; la liste des avertissements acceptés est écrite dans l'audit
(`acceptedWarnings`) :

- date de réussite dans le futur ;
- prérequis manquant (non valide à la date de la formation) ;
- doublon (même personne, même formation, même date) ;
- nomination sans « autorisé par » ;
- personne non présente (candidat, parti, inactif, suspendu) ;
- session complète (capacité dépassée).

Pour une saisie de groupe, les avertissements sont calculés **pour tout le groupe en une fois**.
Le client renvoie la clé des avertissements acceptés : si la situation a changé entre-temps, de
nouveaux avertissements s'affichent au lieu d'enregistrer.

## `/formations`

Sous-navigation en pilules, chaque page vérifie son action :

| Page             | Qui                                       | Contenu                                                                                        |
| ---------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Sessions         | `trainingSession.manage` (TOPAZE, FORMAT) | à venir et passées, création (formation, dates, lieu, lien Pegass, places), annulation motivée |
| Session          | idem                                      | inscrits, résultats un par un ou en lot, inscription de personnes, attente de la formation     |
| Saisie de groupe | idem                                      | une formation, une date, un résultat, puis des cases sur les personnes (recherche)             |
| Listes d'attente | idem                                      | souhaits par formation, priorité puis ancienneté ; « Inscrire » sur une session à venir        |
| Trouver          | `training.read`                           | jusqu'à 3 compétences valides (ET) et un nom                                                   |
| Référentiel      | `reference.manage` (TOPAZE, FORMAT)       | libellé, catégorie, validité, 31/12, interdit aux mineurs, prérequis, `managedBy`, actif       |

- **Résultats** : `REGISTERED` → `PASSED`, `FAILED`, `ABSENT`, `TO_CONFIRM` ; `expiresAt`
  recalculé à chaque changement ; une réussite clôt le souhait ouvert (`DONE`).
- **Listes d'attente** : « Inscrire à une session » passe le souhait à `SCHEDULED` et crée
  l'inscription ; la réussite le passe à `DONE`.
- **Référentiel** : jamais de suppression, une entrée se désactive. `seed:base` ne réécrit
  plus le référentiel ni ses prérequis à chaque déploiement.

## Trouver

- Seulement les présents (`ACTIVE`, `PAUSED`), **jamais les suspendus**, non archivés.
- Filtré **en SQL avant de compter** par la visibilité de l'annuaire (`visibleSql`,
  `person.directory.read`).
- Une compétence est détenue quand son état est valide : réussite non expirée (datée ou non)
  ou nomination en cours.
- Cartes : nom, compétences demandées avec leur état, téléphone (`tel:`) et e-mail (`mailto:`)
  cliquables, « Copier les e-mails » (séparés par `;`). Téléphone et e-mail sont des champs de
  l'annuaire (`persons`), pas des données de `PersonSensitive`.

## Fiche

- **Formations** : lignes par catégorie avec l'état, l'échéance ; « Ajouter une formation »
  (avertissements), « Annuler » une ligne (motif), « Ajouter un souhait ».
- **Fonctions** : « Nommer » (fonction, début, autorisé par, référence de décision,
  commentaire), « Terminer » (date de fin), « Annuler » (motif). Les fonctions proposées sont
  celles que la politique autorise : profils de `managedBy` de la fonction (CHEF_PAPS et CDPE par
  ACTION, CI et CI_SDIS par LASER, CH_* par les deux, ASSIST_FORM par FORMAT GP) et TOPAZE.
- Une nomination importée qui viole la règle des mineurs reste (le seed en montre une) ;
  l'étape 12 la signalera.

## Captures

`docs/captures/formations-sessions-1440.png`, `formations-saisie-1440.png` (avertissements),
`formations-trouver-1440.png`, `fiche-formations-etape10-1440.png`.
