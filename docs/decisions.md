# Journal des décisions (ADR)

Format court : contexte, décision, conséquences. Une entrée par décision, dans l'ordre.

## ADR-001 — Stack : Next.js 15, React 19, TypeScript strict, Tailwind v4, pnpm

**Contexte.** Une application interne, utilisée sur PC par six profils de responsables et sur
téléphone par les candidats, développée par une petite équipe assistée.

**Décision.** Next.js 15 (App Router, Server Components par défaut), React 19, TypeScript
`strict` + `noUncheckedIndexedAccess`, Tailwind CSS v4 (configuration CSS-first), pnpm. Tests
unitaires Vitest + Testing Library, e2e Playwright + axe. Composants UI écrits à la main, Radix
uniquement pour les primitives (Slot, DropdownMenu, Dialog).

**Conséquences.** Un seul framework pour le rendu, les routes API et les pages publiques.
Le rendu côté serveur limite le JavaScript envoyé aux téléphones des candidats. Pas de kit UI
complet à maintenir ni à thémer.

## ADR-002 — Portabilité : Vercel + Supabase en test, VPS en cible

**Contexte.** La phase de test tourne sur Vercel avec Supabase, utilisé **uniquement comme base
PostgreSQL**. La cible est un VPS auto-hébergé.

**Décision.** Aucun SDK Supabase, aucune authentification Supabase, aucune Edge Function, aucune
dépendance propre à Vercel dans le code métier. PostgreSQL standard via Prisma. Fichiers derrière
une interface `StorageService`, mails derrière `MailService` (SMTP), tâches planifiées exposées par
une route HTTP protégée appelée par un cron externe. Docker (`Dockerfile` multi-étapes,
`docker-compose.yml` avec `postgres:16`) fourni dès l'étape 1.

**Conséquences.** La migration vers le VPS se résume à changer `DATABASE_URL`, l'implémentation
du stockage et le cron. Le prix : ne pas profiter des services managés de Supabase.

## ADR-003 — Couche `src/server/` : repositories et services

**Contexte.** Les Server Components rendent tentant l'accès direct à la base depuis les pages.

**Décision.** Les pages, actions et routes appellent des services dans `src/server/services`,
qui appellent des repositories dans `src/server/repositories`, qui seuls importent Prisma. Les
entrées sont validées par Zod avant d'atteindre un service. Le dossier est créé vide à l'étape 1
avec un README qui fixe la règle.

**Conséquences.** Les droits par profil (étape 3) se vérifient à un seul endroit, les services.
Les tests unitaires des règles métier n'ont pas besoin d'un rendu React.

## ADR-004 — Direction artistique : le noir agit, l'accent signale

**Contexte.** Un outil consulté quotidiennement, qui doit rester calme et lisible, et dont les
statuts ont des conséquences (suspension, échéance expirée).

**Décision.** Fond gris `canvas`, cartes blanches sans ombre (rayon 24), boutons et navigation
en pilule. Le noir `ink` porte les actions principales et l'élément actif ; le bleu `accent` est
l'unique accent et signale (mise en avant, progression, focus). Une seule `StatCard highlight`
par écran. Un statut est toujours une pastille **et** un libellé. Les hachures sont réservées
aux données. Geist et Geist Mono embarquées. WCAG 2.1 AA : cibles de 44 px, contraste ≥ 4,5:1,
focus visible, mouvement réduit respecté. Les tokens sont des variables CSS sur `:root`, relues
par le bloc `@theme`, pour qu'un thème sombre puisse venir sans toucher aux composants.

**Conséquences.** `muted` a été assombri de `#717170` à `#6A6A69` pour atteindre 4,5:1 sur
`canvas` ; deux encres `ok-ink` et `danger-ink` ont été ajoutées pour les chips. Tout est
consigné dans `docs/design-system.md`.

## ADR-005 — Données synthétiques uniquement

**Contexte.** Les données des bénévoles sont des données personnelles classées C3 confidentiel.

**Décision.** Aucune donnée réelle dans le dépôt, les seeds, les tests, les captures ni les
exemples. Les écrans de démonstration portent la mention « Données fictives ». L'utilisateur de
développement (`src/lib/dev-user.ts`) est fictif et sera remplacé par la session réelle à
l'étape 3. L'import de l'ancien classeur (étape 4) se fera sur un fichier hors dépôt.

**Conséquences.** Les captures d'écran et les tests sont partageables sans précaution. La seed
de l'étape 2 génère des personnes inventées, marquées « Donnée fictive (seed) », avec des NIVOL
au bon format commençant par `000` et des e-mails en `@exemple.test`.

## ADR-006 — Un seul modèle `Person` pour le candidat et le bénévole

**Contexte.** Un candidat devient bénévole sans changer d'identité ; le classeur ne distinguait
qu'un statut. Deux tables obligeraient à copier la fiche, ses contacts et ses documents au
moment de l'intégration, et à reconstituer l'historique.

**Décision.** Une seule table `persons`, avec `status` (`CANDIDATE`, `ACTIVE`, `PAUSED`,
`SUSPENDED`, `INACTIVE`, `LEFT`). Le parcours d'intégration vit dans `candidacies` (une seule
ouverte à la fois, garantie par un index partiel) et `candidacy_events`. Les données sensibles
sont séparées dans `person_sensitive`, `emergency_contacts` et `documents`, pour que l'étape 3
en filtre l'accès à un seul endroit.

**Conséquences.** L'intégration est un changement de statut, pas une migration de données. Une
personne partie peut recandidater (nouvelle candidature). Les règles qui dépendent du statut
(NIVOL obligatoire hors CANDIDATE, LEFT et INACTIVE) sont des contraintes `CHECK`.

## ADR-007 — Périmètres des profils pilotés par le référentiel

**Contexte.** ACTION, LASER et FORMAT GP ne voient que « leurs » bénévoles : PSC et PSE pour
ACTION, TCAU et PSE pour LASER, formateurs et assistants pour FORMAT GP. Coder ces listes en
dur obligerait à redéployer à chaque évolution du référentiel.

**Décision.** Chaque `reference_items` porte un tableau `perimeters` (`ACTION`, `LASER`,
`FORMAT_GP`). `perimetersOf()` déduit les périmètres d'une personne de ses formations validées
et non expirées et de ses nominations actives. Valeurs par défaut : PSC → ACTION ; PSE →
ACTION et LASER ; TCAU → LASER ; FPSE, FPSC et ASSIST_FORM → FORMAT_GP.

**Conséquences.** Changer un périmètre est une modification de données, tracée dans l'audit.
TOPAZE, FORMAT et DIAMANT n'ont pas de périmètre : leur portée sera fixée par les règles de
l'étape 3.

## ADR-008 — Journaux en ajout seul garantis par la base

**Contexte.** L'audit et le journal des consultations sensibles doivent être fiables même face
à un bug applicatif ou à une manipulation directe en SQL.

**Décision.** Un déclencheur `BEFORE UPDATE OR DELETE OR TRUNCATE … FOR EACH STATEMENT` refuse
toute modification de `audit_logs` et `access_logs`, avec un message explicite. Seule une
transaction qui exécute `SET LOCAL binivol.allow_purge = 'on'` passe : ce sera la purge RGPD de
l'étape 14 (et la remise à zéro de la base de test). Les journaux n'ont pas de clé étrangère
pour survivre aux entités qu'ils décrivent. `withAudit()` écrit les entrées dans la même
transaction que la modification et masque les valeurs sensibles.

**Conséquences.** Un rôle superutilisateur peut toujours désactiver le déclencheur : en
production, l'application se connectera avec un rôle non propriétaire des tables (étape 15). Le
seed n'insère ses entrées d'audit qu'une fois (`ON CONFLICT DO NOTHING`).

## ADR-009 — Format du NIVOL : 11 chiffres suivis d'une lettre

**Contexte.** À l'étape 1, le format était une hypothèse large (6 à 20 caractères
alphanumériques). Les 46 NIVOL de l'ancien classeur ont tous la même forme : 11 chiffres suivis
d'une lettre, soit 12 caractères.

**Décision.** Règle `^\d{11}[A-Z]$`, appliquée après suppression des espaces et passage en
majuscules (`normalizeNivol()`, `isValidNivolFormat()`), et contrainte `CHECK
persons_nivol_format` en base sur la forme normalisée. Exemple fictif : `00012345678A`. Les NIVOL
du seed commencent par `000` pour ne jamais ressembler à un NIVOL réel connu.

**Conséquences.** Une saisie avec espaces ou minuscule est acceptée et normalisée par
l'application ; la base refuse toute forme non normalisée. Un NIVOL d'un autre format à l'import
sera signalé, pas tronqué.

## ADR-010 — Prisma 7 avec l'adaptateur `pg`, SQL brut limité aux migrations

**Contexte.** Le tag npm `latest` de Prisma pointait vers une version candidate (8.0.0-rc) ; la
dernière version stable est la 7.10.1. Prisma 7 se connecte par un adaptateur de pilote et ne
sait pas exprimer les contraintes `CHECK`, les déclencheurs ni les fonctions SQL.

**Décision.** Prisma 7.10.1 avec `@prisma/adapter-pg`, client généré dans `src/generated/prisma`
(ignoré par git, régénéré au `postinstall`). Les migrations passent par `DIRECT_URL`,
l'application par `DATABASE_URL`. Les index partiels sont déclarés dans le schéma (fonctionnalité
`partialIndexes`) ; `CHECK`, déclencheurs et fonctions vivent dans des migrations SQL relues. La
recherche sans accents utilise une fonction SQL pure (`binivol_normalize`) plutôt que
l'extension `unaccent`, pour rester sur un PostgreSQL nu. Pas de suppression physique en dehors
de la purge, pas de RLS : la sécurité est applicative (étape 3).

**Conséquences.** Aucune dépendance propre à Supabase. Avec l'adaptateur `pg`, le paramètre
`pgbouncer=true` est sans effet mais sans danger : le pilote n'utilise pas d'instructions
préparées nommées, ce qui est compatible avec le pooler en mode transaction.
