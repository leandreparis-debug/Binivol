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
- Fichiers : `StorageService` (`src/server/storage/`, pilotes `local` et `s3`), clés aléatoires,
  type vérifié par la signature binaire, **jamais d'URL publique ni présignée** : tout fichier
  est servi par une route qui vérifie les droits et écrit un `AccessLog` (`docs/storage.md`).

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
- La taille `sm` du `Button` (36 px) est réservée aux tableaux denses sur ordinateur, jamais sur
  un écran mobile ni dans le parcours candidat.

## Base de données

- Modèle documenté dans `docs/data-model.md` ; le schéma est `prisma/schema.prisma`.
- Toute évolution passe par `pnpm db:migrate --create-only`, puis relecture du SQL avant
  application. **Ne jamais modifier une migration déjà poussée** : en ajouter une nouvelle.
- SQL brut uniquement dans les migrations (`CHECK`, déclencheurs, fonctions) ; un index partiel
  s'écrit dans le schéma, sous la forme restituée par PostgreSQL.
- **Pas de suppression physique** de données métier : `archivedAt` ou annulation tracée
  (`cancelledAt`, `cancelledById`, `cancelReason`). Les journaux sont en ajout seul.
- Toute écriture métier passe par `withAudit()` (`src/server/audit.ts`) ; les valeurs sensibles
  sont masquées.
- Les données sensibles sont dans `PersonSensitive`, `EmergencyContact` et `Document` : ne
  jamais les charger dans une liste ni les écrire dans un log.
- NIVOL : toujours via `normalizeNivol()` (11 chiffres + 1 lettre).
- `pnpm test:db` (base réelle) avant de pousser une modification du schéma ou de `src/server/`.
- Production : `db:seed:base` **uniquement**. `db:seed:demo` et `db:fresh` sont réservés aux
  bases locales (ils le vérifient).
- **Jamais de vrai classeur ni de fichier `.xlsx` réel dans le dépôt** : seuls les classeurs
  fictifs de `tests/fixtures/` (générés par `pnpm fixtures:classeur`) sont versionnés. Le fichier
  importé n'est jamais stocké (`src/server/import/`).

## Connexion et droits

- Seuls les responsables se connectent (Google @croix-rouge.fr, comptes créés par TOPAZE).
  Les droits sont décrits dans `docs/permissions.md`, généré par `pnpm docs:permissions`.
- **Toutes les règles d'accès sont dans la politique** (`src/server/policy/`) : `can()` est
  pure, la matrice est dans `matrix.ts`. Jamais de test de profil ailleurs dans le code.
- **Toute action serveur passe par `defineAction`** (`src/server/actions/defineAction.ts`),
  ou par `definePublicAction` pour les seules actions sans session (connexion, déconnexion).
  Un test d'architecture le vérifie.
- **Les données sensibles ne se lisent que par `src/server/sensitive.ts`**, qui journalise
  chaque consultation dans `access_logs`, **et le dossier en ligne que par
  `src/server/dossier/store.ts`** (revue journalisée, contexte « dossier »). Un test
  d'architecture le vérifie.
- **Dossier en ligne** (`docs/dossier.md`) : le jeton n'est jamais stocké ni journalisé (seule
  son empreinte SHA-256) ; les actions du candidat passent par `definePublicAction` et relisent
  le cookie de dossier ; le NIVOL et l'e-mail CRF déclarés ne sont jamais reportés dans la fiche.
- E-mails uniquement par `MailService` (`src/server/mail/`, `docs/mail.md`).
- Chaque page appelle `requirePageAccess(action)` (ou `authorizePage` avec la personne) ; le
  middleware n'est pas une sécurité.
- **Jamais de donnée sensible dans le rendu initial d'une page** : elle s'affiche à la demande,
  par une action serveur qui passe par `readPersonSensitive` (journalisée). Seul l'âge, dérivé,
  sort de `sensitive.ts` sans journal.
- **Les listes filtrent en SQL avant de compter et de paginer** : `visibleSql()`
  (`src/server/policy/visibility.ts`), miroir de `can()`, testé contre lui sur le seed. Toute
  modification de la matrice se reporte dans `visibility.ts`.
- Une personne qu'un profil ne voit pas dans l'annuaire est **introuvable** (404) pour lui ;
  visible mais hors périmètre, elle est interdite (403). La fiche s'ouvre avec
  `person.full.read`, ou réduite à l'onglet Formations avec `training.read` seul
  (`personPageAccess()`).
- **Passages d'étape des candidatures** : uniquement par la machine pure
  `src/server/candidacy/machine.ts` ; chaque passage porte l'étape attendue (concurrence) et écrit
  un `CandidacyEvent` dans la même transaction (`docs/integration.md`).
- Les profils se relisent en base à chaque requête (`getActor`) : ne jamais les mettre en
  cache dans un cookie ou une session.
- La connexion démo (`AUTH_DEMO_LOGIN`) n'existe jamais sur Vercel ; le serveur refuse de
  démarrer si `VERCEL_ENV` est défini. **Seule exception** (ADR-035, décidée par le
  responsable du projet) : un déploiement de **test** à données fictives, avec en plus
  `AUTH_DEMO_ON_VERCEL=true` ; l'import de classeur y est alors refusé. Jamais en production
  réelle.

## Base hébergée (Supabase) et déploiement

- **Aucune commande ne modifie le schéma ou les données de la base hébergée en dehors du build
  de production** (`pnpm vercel-build`, `src/server/deploy/buildPlan.ts`). Une prévisualisation
  ne migre ni ne seede jamais.
- **Pas de `migrate reset`, de `db push`, ni de SQL d'écriture lancé à la main sur Supabase.**
- **Les secrets ne passent jamais par la conversation** : on les saisit directement dans Vercel
  (ou sur le VPS). Ni mot de passe, ni clé, ni jeton dans un message, un commit ou un log.
- Fonctions en `cdg1` (Paris, `vercel.json`), au plus près de Supabase `eu-west-3`
  (`docs/deploy.md`).

## Workflow

- Conventional Commits : `feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, `ci:`.
  Un ou plusieurs commits par point de spécification.
- **`pnpm verify` avant chaque commit** (format, lint sans avertissement, typecheck, tests).
  `pnpm test:db` et `pnpm test:e2e` avant de pousser une étape.
- Aucun `console.log` laissé, aucun `any`, aucun secret en dur (`.env.example` documenté).
- Journal des décisions : `docs/decisions.md`. Design system : `docs/design-system.md`.
