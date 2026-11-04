# Binivol

Outil de gestion des bénévoles de l'**unité locale de Versailles de la Croix-Rouge française**.
Il suit toute la vie d'un bénévole : candidature, intégration (dossier signé en ligne, création
du compte Gaia, attribution du NIVOL), formations, nominations, points de suivi, départ.

Les utilisateurs sont les six profils de responsables (TOPAZE, ACTION, LASER, FORMAT, FORMAT GP,
DIAMANT). **Les bénévoles n'ont pas de compte.** Les candidats remplissent leur dossier depuis
un lien sécurisé, sur téléphone.

> **Étape 1** : initialisation, design system et coquille de l'application. Aucune donnée réelle
> n'est présente dans ce dépôt : tout ce qui est affiché est synthétique et marqué « Données
> fictives ».

## Prérequis

- Node 22 LTS (voir `.nvmrc`)
- pnpm 10 (`corepack enable` suffit)
- Docker et Docker Compose (optionnel, pour le lancement conteneurisé)

## Installation

```bash
pnpm install
cp .env.example .env
pnpm dev
```

L'application tourne sur <http://localhost:3000>. La page `/design` présente le design system.

## Commandes

| Commande            | Rôle                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| `pnpm dev`          | Serveur de développement                                                 |
| `pnpm build`        | Build de production (sortie `standalone`)                                |
| `pnpm start`        | Serveur de production                                                    |
| `pnpm lint`         | ESLint (config Next + typescript-eslint strict), zéro avertissement      |
| `pnpm format`       | Prettier (écriture)                                                      |
| `pnpm format:check` | Prettier (vérification)                                                  |
| `pnpm typecheck`    | `tsc --noEmit`                                                           |
| `pnpm test`         | Tests unitaires Vitest                                                   |
| `pnpm test:watch`   | Vitest en mode interactif                                                |
| `pnpm test:e2e`     | Playwright sur le build de production (`pnpm build && pnpm start`)       |
| `pnpm verify`       | `format:check` + `lint` + `typecheck` + `test` — **avant chaque commit** |
| `pnpm icons`        | Régénère `icon.svg` et `apple-icon.png` depuis le tracé du logo          |

Avant le premier `pnpm test:e2e` en local : `pnpm exec playwright install chromium`.

## Lancement en Docker

```bash
cp .env.example .env   # renseigne POSTGRES_PASSWORD
docker compose up --build
curl localhost:3000/api/health
```

Le service `db` (PostgreSQL 16, volume nommé `binivol-db`) est démarré mais pas encore utilisé par
l'application : il sera branché à l'étape 2 avec Prisma.

## Structure des dossiers

```
.github/workflows/ci.yml   CI : pnpm verify + Playwright
docs/                      design-system.md, decisions.md (ADR)
e2e/                       tests Playwright (+ axe)
scripts/                   generate-icons.ts
src/app/                   App Router
  (app)/                   coquille connectée : /, /benevoles, /candidats, /formations, /rappels, /design
  (public)/                parcours candidat sans connexion : /dossier/demo
  api/health/              sonde de vie
  globals.css              tokens de la DA (bloc @theme)
src/components/
  brand/                   BinivolMark, BinivolLogo
  layout/                  TopBar, BottomNav, AppShell, PageHeader
  ui/                      composants de base écrits à la main
src/lib/                   utilitaires : cn, dates, initials, nivol, status, env, dev-user
src/server/                couche d'accès aux données (vide, voir son README)
src/test/                  setup Vitest
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
