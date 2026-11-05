# Binivol

Outil de gestion des bénévoles de l'**unité locale de Versailles de la Croix-Rouge française**.
Il suit toute la vie d'un bénévole : candidature, intégration (dossier signé en ligne, création
du compte Gaia, attribution du NIVOL), formations, nominations, points de suivi, départ.

Les utilisateurs sont les six profils de responsables (TOPAZE, ACTION, LASER, FORMAT, FORMAT GP,
DIAMANT). **Les bénévoles n'ont pas de compte.** Les candidats remplissent leur dossier depuis
un lien sécurisé, sur téléphone.

> **Étapes 1 à 5** : initialisation, design system, coquille de l'application, modèle de
> données complet (Prisma + PostgreSQL) et seed synthétique, connexion Google, profils et
> droits, import de l'ancien classeur, puis annuaire `/benevoles` et fiche bénévole avec
> documents. Aucune donnée réelle n'est présente dans ce dépôt : tout ce qui est affiché est
> synthétique et marqué « Données fictives ».

## Prérequis

- Node 22 LTS (voir `.nvmrc`)
- pnpm 10 (`corepack enable` suffit)
- Docker et Docker Compose (optionnel, pour le lancement conteneurisé)

## Installation

```bash
pnpm install
cp .env.example .env
docker compose up -d db db-test
pnpm db:fresh
pnpm dev
```

`pnpm install` génère le client Prisma (`postinstall`). L'application tourne sur
<http://localhost:3000>. La page `/design` présente le design system.

## Connexion

Seuls les responsables se connectent, avec leur compte Google @croix-rouge.fr ; le guide
complet (client Google, variables, Vercel) est dans `docs/auth.md`, les droits dans
`docs/permissions.md`.

- **En local, sans Google** : mets `AUTH_DEMO_LOGIN=true` et un `AUTH_SECRET` dans `.env`. La
  page `/connexion` liste les 7 comptes fictifs `@binivol.test` du seed (un par profil, plus
  un compte FORMAT + DIAMANT). Interdit sur Vercel : le serveur refuse de démarrer.
- **Premier compte TOPAZE** (avant la première connexion Google) :

  ```bash
  pnpm admin:grant prenom.nom@croix-rouge.fr TOPAZE --name "Prénom Nom"
  ```

  `pnpm admin:revoke <email>` désactive un compte. Ensuite, TOPAZE gère les comptes dans
  l'app (`/admin/comptes`).

## Commandes

| Commande                 | Rôle                                                                              |
| ------------------------ | --------------------------------------------------------------------------------- |
| `pnpm dev`               | Serveur de développement                                                          |
| `pnpm build`             | Build de production (sortie `standalone`)                                         |
| `pnpm start`             | Serveur de production                                                             |
| `pnpm lint`              | ESLint (config Next + typescript-eslint strict), zéro avertissement               |
| `pnpm format`            | Prettier (écriture)                                                               |
| `pnpm format:check`      | Prettier (vérification)                                                           |
| `pnpm typecheck`         | `tsc --noEmit`                                                                    |
| `pnpm test`              | Tests unitaires Vitest                                                            |
| `pnpm test:watch`        | Vitest en mode interactif                                                         |
| `pnpm test:db`           | Tests d'intégration sur une vraie base PostgreSQL (`TEST_DATABASE_URL`)           |
| `pnpm test:e2e`          | Playwright sur le build de production (`pnpm build && pnpm start`)                |
| `pnpm verify`            | `format:check` + `lint` + `typecheck` + `test` — **avant chaque commit**          |
| `pnpm icons`             | Régénère `icon.svg` et `apple-icon.png` depuis le tracé du logo                   |
| `pnpm db:migrate`        | `prisma migrate dev` : crée et applique une migration (développement)             |
| `pnpm db:deploy`         | `prisma migrate deploy` : applique les migrations (test, production)              |
| `pnpm db:fresh`          | **Local seulement** : supprime et recrée la base, migrations et seed démo         |
| `pnpm db:reset`          | Alias de `db:fresh`                                                               |
| `pnpm db:seed:base`      | Référentiel, paramètres, règles de rappel : **seul seed de production**           |
| `pnpm db:seed:demo`      | Seed de base + comptes démo et 60 personnes fictives (refuse de vraies données)   |
| `pnpm db:seed`           | Alias de `db:seed:demo`                                                           |
| `pnpm import:classeur`   | Import de l'ancien classeur (`<fichier.xlsx> [--dry-run]`), voir `docs/import.md` |
| `pnpm fixtures:classeur` | Régénère les classeurs fictifs de `tests/fixtures/`                               |
| `pnpm db:studio`         | Prisma Studio, pour parcourir les tables                                          |
| `pnpm admin:grant`       | Crée ou modifie un compte responsable (`<email> <PROFIL...>`)                     |
| `pnpm admin:revoke`      | Désactive un compte responsable (`<email>`)                                       |
| `pnpm docs:permissions`  | Régénère `docs/permissions.md` depuis la matrice des droits                       |

Avant le premier `pnpm test:e2e` en local : `pnpm exec playwright install chromium`.

## Lancement en Docker

```bash
cp .env.example .env   # renseigne POSTGRES_PASSWORD
docker compose up --build
curl localhost:3000/api/health
```

Le service `db` (PostgreSQL 16, volume nommé `binivol-db`) sert l'application ; `db-test`
(port 5433, en mémoire) sert aux tests d'intégration. Les migrations s'appliquent depuis la
machine hôte avec `pnpm db:deploy`.

## Stockage des documents

Les justificatifs passent par `StorageService` (`src/server/storage/`) : pilote `local` (un
dossier, `./storage` par défaut, ignoré par Git) ou `s3` (Supabase Storage, MinIO…), choisi par
`STORAGE_DRIVER`. Jamais d'URL publique : les fichiers sont servis par
`GET /api/documents/[id]`, qui vérifie les droits et journalise la consultation. Configuration et
sauvegarde : `docs/storage.md`.

## Base de données

PostgreSQL standard, accès uniquement par Prisma 7 (adaptateur `pg`) via `src/server/`. Le modèle
est décrit dans `docs/data-model.md`.

Deux URL sont lues :

| Variable       | Rôle                                         | Docker local                                        | Supabase (Postgres seul)                                                     |
| -------------- | -------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL` | connexion de l'application (pooler possible) | `postgresql://binivol:<mdp>@localhost:5432/binivol` | pooler en mode transaction, port **6543**, `?pgbouncer=true&sslmode=require` |
| `DIRECT_URL`   | connexion des migrations (jamais le pooler)  | identique à `DATABASE_URL`                          | connexion directe, port **5432**, `?sslmode=require`                         |

Sur Supabase, ajoute `SHADOW_DATABASE_URL` (une base vide) si tu lances `pnpm db:migrate` : le
compte ne peut pas créer la base temporaire dont Prisma a besoin. `pnpm db:deploy` n'en a pas
besoin.

Environnements :

- **Développement** : `docker compose up -d db`, puis `pnpm db:migrate` pour faire évoluer le
  schéma et `pnpm db:seed` pour les données fictives. `pnpm db:studio` pour les consulter.
- **Tests d'intégration** : `docker compose up -d db-test`, puis `pnpm test:db`. La base visée
  par `TEST_DATABASE_URL` doit avoir « test » dans son nom ; elle est vidée et migrée à chaque
  exécution. `pnpm verify` ne lance pas ces tests, pour rester rapide.
- **Base neuve en local** : `pnpm db:fresh` supprime et recrée la base de `DATABASE_URL`, puis
  applique les migrations et le seed de démonstration. Il refuse tout hôte non local et
  `NODE_ENV=production`.
- **Production (et Supabase de test)** : `pnpm db:deploy`, puis **`pnpm db:seed:base`
  uniquement** (référentiel, paramètres, règles de rappel ; aucune personne). Les données réelles
  arrivent par l'import du classeur (`docs/import.md`). Aucun SDK ni extension Supabase.

Règles : pas de suppression physique (archivage ou annulation tracée), journaux `audit_logs` et
`access_logs` en ajout seul (garanti par un déclencheur), jetons et codes stockés hachés. Si
`DATABASE_URL` manque, le build passe, le serveur l'indique au démarrage et la première requête
échoue avec un message explicite.

## Structure des dossiers

```
.github/workflows/ci.yml   CI : pnpm verify + Playwright
docs/                      auth.md, data-model.md, decisions.md (ADR), design-system.md, import.md, permissions.md (généré), storage.md
e2e/                       tests Playwright (+ axe)
prisma/                    schema.prisma, migrations/, seed.ts, seed/ (données fictives)
scripts/                   generate-icons.ts, admin.ts, db-fresh.ts, import-classeur.ts, make-fixture-classeur.ts
tests/fixtures/            classeurs .xlsx 100 % fictifs (les seuls .xlsx du dépôt)
src/app/                   App Router
  (app)/                   coquille connectée : /, /benevoles (annuaire), /benevoles/[ref] (fiche), /candidats, /formations, /rappels, /design
  (public)/                parcours candidat sans connexion : /dossier/demo
  api/health/              sonde de vie
  api/documents/[id]/      téléchargement d'un document (droits + access_logs)
  globals.css              tokens de la DA (bloc @theme)
src/components/
  brand/                   BinivolMark, BinivolLogo
  person/                  DeadlineDot, DeadlineBar, QualificationPills, TabNav
  layout/                  TopBar, BottomNav, AppShell, PageHeader
  ui/                      composants de base écrits à la main
src/generated/prisma/      client Prisma généré (non versionné)
src/lib/                   utilitaires : cn, dates, age, deadlines, phone, timeline, personForms, initials, labels, nivol, status, env
src/server/                accès aux données : db, audit, sensitive, timeline, storage/, auth/, policy/, actions/, services/, repositories/
src/test/                  setup Vitest, harnais de la base de test (db/)
```

## Conventions

- Interface **en français** ; code, fichiers, variables et commits **en anglais**.
- Composants en `PascalCase.tsx`, utilitaires en `camelCase.ts`, routes en kebab-case français.
- Dates au format français, fuseau `Europe/Paris` (`src/lib/dates.ts`).
- Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`…).
- Les pages et composants ne touchent jamais à la base : tout passe par `src/server/`.
- Aucun SDK Supabase, aucun code propre à Vercel dans le métier : l'application doit pouvoir
  migrer vers un VPS sans réécriture.
- Accessibilité WCAG 2.1 AA : cibles d'au moins 44 × 44 px, focus visible, statut toujours
  « pastille + libellé », `prefers-reduced-motion` respecté.

Les règles complètes pour les sessions de développement assisté sont dans `CLAUDE.md`.
