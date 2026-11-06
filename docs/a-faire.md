# « À faire » : listes, tâches confiées, projets (étape 16)

Chaque responsable connecté a sa propre liste de travail. Il peut aussi mettre une tâche dans la
liste d'un autre, la partager à plusieurs, ou monter un projet commun. Guide utilisateur :
`docs/guides/a-faire.md` (affiché sur `/aide` pour tous les profils). Décision : ADR-067.

## Modèle

Tables `todo_projects`, `todo_project_members`, `todos`, `todo_assignees`, `todo_comments`
(`docs/data-model.md`, migration `20261113090000_todos`). Rien n'est supprimé : `archived_at`
(tâche, projet, commentaire), `removed_at` (assignation, adhésion). Une tâche sans assigné
explicite est assignée à son auteur ; plusieurs assignés = tâche partagée, faite dès que l'un
la coche (`completed_by_id`). `position` est propre à chaque assigné (l'ordre de SA liste).

## Droits (`src/server/policy/`)

| Action                | Qui                                                                     |
| --------------------- | ----------------------------------------------------------------------- |
| `todo.read`           | l'auteur, un assigné actif, un membre actif du projet de la tâche       |
| `todo.write`          | les mêmes : cocher, commenter, ajouter dans le projet, se retirer       |
| `todo.manage`         | l'auteur, ou un OWNER actif du projet : modifier, réattribuer, archiver |
| `todo.project.manage` | un OWNER actif du projet : membres, rôles, nom, archivage (≥ 1 OWNER)   |

- Les conditions (`todoParticipant`, `todoManager`, `projectOwner`) sont **relationnelles** et
  identiques pour tous les profils : **TOPAZE n'a pas de passe-droit**.
- `todoVisibleSql(userId)` (`visibility.ts`) est le miroir SQL de `todo.read`, testé contre
  `can()` sur le seed, compte par compte (`todos.db.test.ts`).
- Confier / partager : uniquement à des responsables actifs ; dans un projet, à ses membres.
- Rattacher une personne exige `person.directory.read` sur elle. À l'affichage, une personne
  que le profil ne voit plus est remplacée par « Personne non accessible » ; le lien vers la
  fiche n'apparaît qu'avec l'accès à la fiche (`personPageAccess`).
- Retirer un membre retire aussi ses assignations sur les tâches ouvertes du projet.

## Journal d'audit

Toutes les écritures passent par `withAudit`. `Todo.title`, `Todo.note`,
`TodoComment.body` et `TodoProject.description` sont masqués (`SENSITIVE_FIELDS`) : le journal
garde l'id, le champ modifié et la date, jamais le texte. Le nom d'un projet n'est pas masqué.

## Notifications (cloche, pas d'e-mail en V1)

| Événement                                       | Destinataire         | `dedupeKey`                      |
| ----------------------------------------------- | -------------------- | -------------------------------- |
| On me confie ou me partage une tâche            | l'assigné            | `todo:assigned:<assignation>`    |
| On m'ajoute à un projet                         | le membre            | `todo:project-member:<adhésion>` |
| Commentaire sur une tâche où je suis            | auteur et assignés   | `todo:comment:<commentaire>`     |
| Une tâche que j'ai créée est faite              | l'auteur             | `todo:done:<tâche>:<instant>`    |
| « Ce n'est pas pour moi »                       | l'auteur             | `todo:declined:<assignation>`    |
| Le matin, tâche due aujourd'hui (tâche du jour) | chaque assigné actif | `todo:due:<tâche>:<jour>`        |

Jamais à soi-même. `(user_id, dedupe_key)` est unique : rejouer ne duplique rien.

## Cycle de vie

- **Désactivation d'un compte** (`setActive`) : ses assignations sont retirées ; une tâche qui
  n'a plus personne revient à son auteur ; les tâches qu'il avait confiées restent visibles de
  leurs assignés ; s'il était le dernier OWNER d'un projet, le membre actif le plus ancien
  devient OWNER (tracé dans l'audit).
- **RGPD** : l'export d'une personne inclut `taches_liees` (titre, dates) ; la purge détache
  ses tâches (`person_id` à nul) sans les supprimer.
- **Restauration** : une tâche ou un projet archivé se restaure pendant 30 jours.

## Écrans

- `/a-faire` (Ma liste), `/a-faire/confiees`, `/a-faire/projets`, `/a-faire/projets/[id]` ;
  panneau d'une tâche par `?tache=<id>` (côté droit sur ordinateur, plein écran sur téléphone).
- Ajout rapide (`src/lib/todos.ts`, `parseQuickAdd`) : « aujourd'hui », « demain »,
  « après-demain », un jour de la semaine (le prochain, jamais aujourd'hui), « 12/11 » (cette
  année, ou la suivante si passée), « 12/11/2026 » ; `@Prénom` (ou `@prénom.nom`) ; `#projet`.
  Tout est aussi choisissable par menus (« Options »).
- Navigation : « À faire » avec le nombre de tâches en retard ou du jour ; accueil : carte
  « Mes tâches » ; fiche d'une personne : « Mes tâches liées » et « Ajouter une tâche ».
