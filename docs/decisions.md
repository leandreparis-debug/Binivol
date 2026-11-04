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
de l'étape 2 devra générer des personnes inventées, avec des NIVOL manifestement factices
(préfixe `DEMO`).
