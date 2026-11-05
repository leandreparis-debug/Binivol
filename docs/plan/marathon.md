# Marathon de nuit : finir la V1 de Binivol (étapes 8 à 15, sans VPS)

Ce fichier est la **règle du jeu** d'une session autonome de longue durée. Il fait foi sur
la méthode ; `CLAUDE.md` fait foi sur l'architecture et les règles permanentes, et **prime
en cas de conflit**. Les cahiers des étapes sont dans ce dossier : `etape-08.md` à
`etape-15.md`.

## 1. But

Au réveil de Léandre, la V1 doit être **complète, testée et en ligne sur la démo**
(Vercel + Supabase, données fictives) :

| #   | Étape                                              | Cahier        |
| --- | -------------------------------------------------- | ------------- |
| 8   | Signature électronique et PDF officiels            | `etape-08.md` |
| 9   | Assistant Gaia et passage au statut bénévole       | `etape-09.md` |
| 10  | Formations, compétences et nominations             | `etape-10.md` |
| 11  | Points de suivi, parrainage, B3, pauses et départs | `etape-11.md` |
| 12  | Alertes, rappels et e-mails automatiques           | `etape-12.md` |
| 13  | Tableaux de bord, matrice et exports               | `etape-13.md` |
| 14  | RGPD et administration                             | `etape-14.md` |
| 15  | Recette, audit et guides (sans VPS)                | `etape-15.md` |

**Hors périmètre de la nuit** : migration vers un VPS, Docker de production, cron système,
sauvegardes hors serveur automatisées, Brevo réel, S3 réel. Tout cela est pour plus tard.

## 2. Autonomie : personne ne répondra cette nuit

- **Ne pose jamais de question et n'attends jamais de réponse.** Personne ne lira avant le
  matin. Une question posée, c'est une nuit perdue.
- Quand un choix se présente, prends **l'option la plus propre et la plus réversible**,
  paramétrable si possible, et note-la :
  - dans `docs/decisions.md` (ADR courte) si elle engage l'architecture ;
  - dans `docs/nuit/questions.md` si Léandre doit la confirmer (question, choix fait,
    comment le changer).
- Si une demande d'un cahier est impossible ou dangereuse, **fais la version sûre** et
  explique l'écart dans le journal. Ne contourne jamais une règle de `CLAUDE.md`.

## 3. Journal de nuit et reprise après coupure

La session va durer des heures : ton contexte sera résumé, et la session peut s'arrêter
(limite d'usage, coupure). **Le journal est ta mémoire.**

- `docs/nuit/journal.md` : crée-le au démarrage. Pour chaque étape :
  - statut : `à faire`, `en cours`, `terminée`, `partielle` ou `bloquée` ;
  - commits (hash court) et migrations ajoutées ;
  - résultats des commandes (nombre de tests unitaires, base, e2e) ;
  - écarts au cahier, justifiés ;
  - ce qui reste à faire, précisément, si l'étape n'est pas terminée.
- **Mets-le à jour et pousse-le** à la fin de chaque point de spécification important, et
  au moins à la fin de chaque étape.
- **Au démarrage, et à chaque fois que tu reprends après un résumé du contexte** : relis
  `CLAUDE.md`, ce fichier, `docs/nuit/journal.md`, puis le cahier de l'étape en cours.
  Reprends exactement là où le journal s'arrête. Ne refais jamais une étape `terminée`.
- La section « Récapitulatif demandé » de chaque cahier **s'écrit dans le journal**, pas
  dans la conversation.

## 4. Boucle de travail

Pour chaque étape, dans l'ordre 8 → 15 :

1. Relis le cahier en entier. Commence par sa section « 0. Corrections préalables ».
2. Découpe en points, et fais **un ou plusieurs commits par point** (Conventional Commits,
   en anglais). `pnpm verify` avant chaque commit.
3. Pour une migration : `pnpm db:migrate --create-only`, relis le SQL, puis applique-la.
   Jamais de modification d'une migration déjà poussée.
4. Fin d'étape (« définition de fini ») :
   - `pnpm verify`, `pnpm test:db` et `pnpm test:e2e` verts ;
   - `pnpm db:fresh` passe, et le seed de démo couvre la nouvelle fonctionnalité ;
   - documentation et ADR à jour ; `pnpm docs:permissions` relancé si la matrice change ;
   - captures dans `docs/captures/` quand le cahier en demande ;
   - chaque fichier annoncé existe vraiment ;
   - journal mis à jour.
5. **Pousse la branche** `claude/quirky-johnson-9av6kd`, puis **avance `main` en
   fast-forward** (jamais de `--force`) et pousse `main`. Pousser `main` déclenche le
   déploiement de production de la démo, qui migre et seede la base hébergée : ne pousse
   `main` **que** si les trois suites sont vertes.
6. Si tu peux consulter l'état du déploiement Vercel ou de la CI GitHub (`gh`), vérifie-le
   et note le résultat dans le journal. Sinon, note « non vérifié ».
7. Passe à l'étape suivante **sans attendre**.

Si `main` n'est pas un ancêtre direct de la branche, ne force rien : continue sur la branche,
et note-le en tête du journal.

## 5. Quand ça coince

- **Budget** : si une difficulté résiste après environ **45 minutes d'efforts sérieux**,
  arrête de creuser. Fais la version la plus simple qui reste correcte et sûre, marque le
  point `partielle` avec ce qui manque, et continue.
- **Une suite rouge que tu ne sais pas réparer** : ne pousse pas `main`. Continue sur la
  branche, marque l'étape `partielle`, et passe à une étape suivante dont les dépendances
  sont satisfaites (10 ne dépend que de 5 ; 14 dépend de 12).
- **Interdit**, quelle que soit la pression du temps :
  - désactiver, sauter (`skip`), affaiblir ou supprimer un test pour passer au vert ;
  - `--no-verify`, `--force`, réécriture d'historique ;
  - toute écriture à la main sur la base hébergée (`migrate reset`, `db push`, SQL) ;
  - une donnée réelle dans le dépôt, un test ou une capture ;
  - un secret dans le code, un commit, un log ou le journal ;
  - une dépendance propre à Supabase ou à Vercel dans le code métier.
- Un test e2e qui ne peut pas tourner dans l'environnement (navigateur absent, etc.) :
  dis-le dans le journal, avec la raison, sans le marquer `skip` dans le code.
- **Qualité avant quantité** : mieux vaut 7 étapes propres et une partielle bien décrite
  que 8 étapes bâclées. Mais ne t'arrête pas tant qu'il reste du travail faisable.

## 6. Données et sécurité (rappel)

- Données **fictives uniquement**, marquées « Données fictives » à l'écran.
- La démo hébergée n'a ni S3 ni SMTP réel (`MAIL_DRIVER=log`) : toute fonctionnalité qui en
  dépend doit **dégrader proprement** avec un message clair, jamais planter.
- Les tâches planifiées passent par une route HTTP protégée par un secret
  (`CRON_SECRET`). Sans ce secret configuré, la route refuse tout. Ne mets jamais sa valeur
  nulle part : Léandre la saisira dans Vercel.

## 7. Le matin : `docs/nuit/recap.md`

Avant de t'arrêter (fin du travail, ou dès que tu sens que la session va s'interrompre),
écris et pousse `docs/nuit/recap.md`, en français simple, pour Léandre :

1. **En une phrase** : la V1 est-elle complète ?
2. Un tableau des étapes 8 à 15 : statut, commits, migrations, tests (unit / base / e2e).
3. État de `main`, de la CI et du déploiement de la démo (vérifié ou non).
4. **Ce que Léandre doit faire**, en étapes courtes, avec où cliquer :
   - variables à créer dans Vercel (noms seulement, jamais de valeur) ;
   - choses à vérifier à l'écran sur la démo, avec les comptes de démonstration à utiliser.
5. Les décisions prises seul cette nuit, à confirmer (renvoi vers `docs/nuit/questions.md`).
6. Ce qui reste à faire, étape par étape, pour un prochain prompt.
7. La liste des tests e2e non exécutés, avec la raison.

Termine aussi ta réponse dans la conversation par le contenu de ce récap.
