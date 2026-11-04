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

## ADR-011 — Auth.js v5 en version bêta épinglée, sessions en base

**Contexte.** Il faut couper un compte immédiatement (C3) et rester portable (Vercel puis VPS).
La v5 de `next-auth`, seule à viser l'App Router, n'existe qu'en version bêta.

**Décision.** `next-auth` épinglé à **5.0.0-beta.32**, fournisseur Google seul, stratégie
`database` : sessions de 12 h renouvelées après chaque heure d'activité, cookie `HttpOnly`,
`SameSite=Lax`, `Secure` en HTTPS. La session n'expose que l'identifiant, le nom et l'e-mail ;
les profils sont relus en base à chaque requête (`loadActor`). Désactiver un compte supprime
ses sessions.

**Conséquences.** Une requête de plus par page (compte et profils), acceptable pour une
vingtaine d'utilisateurs. Chaque montée de version de la bêta sera testée avant d'être prise.

## ADR-012 — Adaptateur Auth.js maison, minimal

**Contexte.** `@auth/prisma-adapter` ne déclare la compatibilité qu'avec `@prisma/client`
jusqu'à la v6, crée un `User` à la première connexion et enregistre tous les jetons OAuth.

**Décision.** Adaptateur minimal sur notre client Prisma 7 (`src/server/auth/adapter.ts`) :
`createUser` lève toujours une erreur, `linkAccount` ne garde que l'identifiant Google, une
session d'un compte inactif ou sans profil est ignorée. Le lien par e-mail
(`allowDangerousEmailAccountLinking`) est activé, car le compte est créé à l'avance par TOPAZE
et l'adresse est vérifiée (Google, domaine) dans `signIn`.

**Conséquences.** Pas de dépendance supplémentaire. Aucun jeton Google en base.

## ADR-013 — Politique d'accès pure et centralisée

**Contexte.** Six profils cumulables, des droits qui dépendent de la personne visée, et une
sécurité applicative (pas de RLS).

**Décision.** Une seule fonction `can(actor, action, resource)` (`src/server/policy/can.ts`),
pure, qui applique une matrice déclarative (`matrix.ts`). Les faits sur la personne
(`PersonFacts`) sont calculés à part (`loadPersonFacts`). La liste des actions est fermée
(`src/lib/actions.ts`). `docs/permissions.md` est généré depuis la matrice, et un test échoue
s'il n'est pas à jour. Les pages appellent `requirePageAccess`/`authorizePage` (403 réel via
`forbidden()`, option `experimental.authInterrupts` de Next 15), les actions serveur passent
toutes par `defineAction` (ou `definePublicAction` pour la connexion et la déconnexion), ce
qu'un test d'architecture vérifie. Le middleware ne fait qu'une redirection rapide.

Choix de lecture : une personne **archivée** n'est visible que de TOPAZE, pour toutes les
actions (pas seulement l'annuaire). Un **candidat** ne relève que de DIAMANT (et TOPAZE), même
s'il a déjà une formation qui donne un périmètre. FORMAT agit sur les formations des
bénévoles, pas des candidats.

**Conséquences.** Toute évolution des droits est un changement de données relu et testé
(table de vérité indépendante de la matrice).

## ADR-014 — Un seul chemin vers les données sensibles

**Contexte.** Naissance, adresse, personnes à prévenir, B3, autorisation parentale et
documents sont les données les plus sensibles d'une donnée déjà C3.

**Décision.** Elles ne se lisent que par `src/server/sensitive.ts` (`readPersonSensitive`,
`readDocument`), qui autorise par la politique puis lit et journalise la consultation dans
`access_logs` **dans la même transaction**. Un refus ne lit et n'écrit rien. Un test
d'architecture échoue si `personSensitive`, `emergencyContact` ou `document` sont interrogés
ailleurs dans `src/` (hors tests). Les projections (`toDirectoryView`, `toFullView`) ne
contiennent jamais de champ sensible.

**Conséquences.** Chaque consultation est traçable ; ajouter une lecture sensible impose de
passer par ce module.

## ADR-015 — Périmètre DIAMANT et répartition des nominations

**Contexte.** DIAMANT suit les candidats et les nouveaux ; les nominations aux fonctions
relèvent de profils différents selon la fonction.

**Décision.** Une personne est dans le périmètre DIAMANT si elle est candidate, a une
candidature ouverte, est entrée depuis moins de `NEW_VOLUNTEER_MONTHS` mois (paramètre, 12)
ou a un parrainage en cours comme filleul. Les nominations sont pilotées par
`reference_items.managed_by` : CHEF_PAPS et CDPE par ACTION ; CI et CI_SDIS par LASER ; les
CH_* par ACTION et LASER ; ASSIST_FORM par FORMAT GP ; TOPAZE pour toutes. Un profil ne nomme
que les personnes qui relèvent de lui. Répartition par défaut, à confirmer.

**Conséquences.** Modifier la répartition ne demande pas de déploiement.

## ADR-016 — Le dossier `.next/standalone` contient le `.env` local

**Contexte.** `next build` copie le fichier `.env` du poste dans `.next/standalone`, constaté
à l'étape 2. Ce fichier peut contenir `DATABASE_URL`, `AUTH_SECRET` ou des secrets Google.

**Décision.** Ce dossier ne doit **jamais** être déployé ni copié depuis un poste de
développement. Le seul artefact de production est l'image Docker, construite sans `.env`
(exclu par `.dockerignore`), avec les variables fournies par l'hébergeur ; sur Vercel, le
build se fait sur leurs serveurs avec les variables du projet.

**Conséquences.** Pas de déploiement manuel par copie de fichiers. À rappeler dans la
procédure de l'étape 15.
