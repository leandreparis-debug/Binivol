# Règles permanentes — Binivol

## Produit

Binivol gère les bénévoles de l'unité locale (UL) de Versailles de la Croix-Rouge française :
candidature, intégration (dossier signé en ligne, compte Gaia, NIVOL), formations, nominations,
points de suivi, départ. Les bénévoles **n'ont pas de compte** ; les candidats remplissent leur
dossier depuis un lien sécurisé, sur téléphone.

Six profils de responsables, cumulables :

| Profil        | Rôle                                                   |
| ------------- | ------------------------------------------------------ |
| **TOPAZE**    | DLUS, voit et gère tout                                |
| **ACTION**    | adjoint missions de secours : bénévoles PSC / PSE      |
| **LASER**     | adjoint urgence : bénévoles TCAU et/ou PSE             |
| **FORMAT**    | adjoint formation interne : formations de tous         |
| **FORMAT GP** | adjoint formation grand public : formateurs/assistants |
| **DIAMANT**   | adjoint animation des équipes : candidats, intégration |

## Architecture portable (obligatoire)

- Next.js 15 App Router, Server Components par défaut, React 19, TypeScript strict
  (`noUncheckedIndexedAccess`), Tailwind v4 (CSS-first, `@theme`), pnpm.
- PostgreSQL standard, Prisma comme seul accès aux données (à partir de l'étape 2).
- Test sur Vercel + Supabase (**PostgreSQL uniquement**), puis migration vers un VPS. Donc :
  - **jamais** de SDK Supabase, Supabase Auth, Edge Functions, ni de dépendance propre à Vercel
    dans le code métier ;
  - fichiers derrière `StorageService`, mails derrière `MailService` (SMTP), tâches planifiées
    via une route HTTP protégée ;
  - Docker fourni et fonctionnel.
- **Les composants et les pages n'accèdent jamais à la base.** Chaîne autorisée :
  page / action / route → `src/server/services` → `src/server/repositories` → Prisma.
- Toute entrée est validée par Zod (variables d'environnement incluses, `src/lib/env.ts`).

## Aucune donnée réelle

Les données de bénévoles sont des données personnelles classées C3 confidentiel. Dans le dépôt,
les tests, les seeds, les captures et les exemples : **uniquement des données synthétiques**,
marquées « Données fictives » à l'écran (`FakeDataBanner`). Jamais de vrai nom, NIVOL, mail,
téléphone ni adresse.

## Langue

Interface **en français** (libellés, messages, erreurs, dates `JJ/MM/AAAA`, fuseau
`Europe/Paris`). Code, noms de fichiers, variables, commentaires de code et commits **en
anglais**. Routes en kebab-case français (`/benevoles`, `/candidats`, `/formations`, `/rappels`).

## Direction artistique

- **Le noir agit, l'accent signale** : actions principales en `ink`, l'accent bleu (`accent`)
  est unique et réservé aux signaux (élément mis en avant, progression, focus).
- **Une seule `StatCard variant="highlight"` par écran.**
- **Un statut = une pastille et un libellé**, jamais la couleur seule (`StatusDot`,
  `src/lib/status.ts`).
- **Motifs (hachures) réservés aux données** : graphiques, rails de progression. Jamais en
  décoration.
- Cartes blanches sur fond gris, rayon 24, **sans ombre** ; seuls les menus flottants ont
  `shadow-pop`. Boutons et navigation en pilule.
- Accessibilité WCAG 2.1 AA : contraste ≥ 4,5:1, focus visible (`focus-ring`), cibles ≥ 44 px,
  `prefers-reduced-motion` respecté, champs à 16 px sur mobile.
- Composants dans `src/components/ui/`, écrits à la main, typés, documentés en JSDoc, `className`
  fusionnable via `cn()`.

## Workflow

- Conventional Commits : `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `ci:`.
  Un ou plusieurs commits par point de spécification.
- **`pnpm verify` avant chaque commit** (format, lint sans avertissement, typecheck, tests).
  `pnpm test:e2e` avant de pousser une étape.
- Aucun `console.log` laissé, aucun `any`, aucun secret en dur (`.env.example` documenté).
- Journal des décisions : `docs/decisions.md`. Design system : `docs/design-system.md`.
