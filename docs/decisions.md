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

## ADR-017 — Page 403 avec l'option `authInterrupts` de Next 15

**Contexte.** Une page refusée doit répondre un vrai statut HTTP 403, pas une page 200 avec un
message. Next 15 le permet avec `forbidden()` et `app/forbidden.tsx`, mais seulement sous
l'option expérimentale `experimental.authInterrupts`.

**Décision.** L'option est activée (`next.config.ts`) et `requirePageAccess()` /
`authorizePage()` appellent `forbidden()`. Les tests e2e vérifient le statut 403 et la page.

**Repli si l'option change ou disparaît.** Le seul point d'appel est `src/server/auth/page.ts`.
On remplacera `forbidden()` par un rendu explicite de la page 403 (composant partagé avec
`app/forbidden.tsx`) et un `notFound()` personnalisé pour les ressources, ou par un statut fixé
dans un Route Handler pour les téléchargements. Les tests e2e signaleront toute régression du
statut.

## ADR-018 — Seeds séparés et base neuve en local

**Contexte.** Un seed relancé sur une base ancienne laissait des formations inventées par les
versions précédentes ; et la production ne doit jamais recevoir de données fictives.

**Décision.** `pnpm db:seed:base` (référentiel, paramètres, règles de rappel ; aucune personne,
aucun compte) est **le seul seed autorisé en production**. `pnpm db:seed:demo` l'appelle puis
ajoute les comptes de démonstration et les 60 personnes fictives ; il refuse une base qui
contient une personne sans la note « Donnée fictive (seed) ». `pnpm db:seed` reste un alias de
`db:seed:demo`. `pnpm db:fresh` supprime et recrée la base, applique les migrations et le seed
de démonstration ; il refuse tout hôte autre que `localhost`, `127.0.0.1`, `::1` ou les
services Docker `db` / `db-test`, et `NODE_ENV=production`. Les tests e2e partent d'un
`db:fresh` à chaque exécution.

**Conséquences.** `pnpm db:reset` devient un alias de `db:fresh`. Le garde-fou Prisma qui
bloque `migrate reset` lancé par un agent n'est pas contourné : `db:fresh` est un outil
explicite, borné aux bases locales.

## ADR-019 — Lecture du `.xlsx` avec `exceljs`

**Contexte.** Il faut lire le classeur côté serveur, en mémoire, et écrire des fixtures de test
avec la même structure. Le paquet npm `xlsx` (SheetJS) n'est plus publié sur npm.

**Décision.** `exceljs` 4.4.0 : il lit et écrit le format `.xlsx`, charge un `Buffer` sans
fichier temporaire, expose les types de cellules (date, nombre, texte riche, formule) et est
typé. Son rythme de publication est lent (dernière version fin 2023) : il n'est utilisé que
derrière `src/server/import/workbook.ts`, pour pouvoir en changer sans toucher au reste.

**Conséquences.** Une dépendance de plus (et ses dépendances de compression). Le contrôle de la
signature du fichier (ZIP, `xl/workbook.xml`, fichier chiffré) est fait avant `exceljs`.

## ADR-020 — Import en une transaction, sous verrou, après simulation

**Contexte.** Un import partiel laisserait une base incohérente ; deux imports simultanés se
marcheraient dessus ; un import réel doit avoir été vu en simulation.

**Décision.** Le moteur (`importer.ts`) suit le même code en simulation (lecture seule) et en
import réel, donc le rapport de simulation est exactement ce que fera l'import. L'import réel
s'exécute dans **une seule transaction**, après `pg_try_advisory_xact_lock` : un second import
est refusé. Il n'est accepté que si une simulation **du même fichier** (même SHA-256), **par le
même compte**, a réussi **il y a moins de 30 minutes**, sans erreur bloquante. Chaque essai
(simulation, succès, échec) est gardé dans `import_runs`.

**Conséquences.** Une erreur au milieu annule tout et marque l'essai en échec. La simulation
n'écrit que dans `import_runs` (l'historique), jamais dans les tables métier.

## ADR-021 — Règle de conflit de l'import

**Contexte.** L'import est rejouable ; une donnée corrigée dans Binivol ne doit pas être
écrasée par un nouvel import du classeur.

**Décision.** Avant d'écrire une ligne qui changerait une entité existante, l'import cherche
une entrée d'audit autre que `IMPORT` sur cette entité depuis son dernier import. S'il en
trouve une, la ligne est « ignorée pour conflit », avec la liste des champs concernés. Une
ligne identique reste « inchangée » même après une modification dans Binivol.

**Conséquences.** Toute écriture métier doit passer par `withAudit()` (règle déjà en place) :
c'est ce qui rend la règle fiable.

## ADR-022 — Le fichier importé n'est jamais stocké

**Contexte.** Le classeur concentre toutes les données C3 de l'unité locale.

**Décision.** Le fichier est lu en mémoire et oublié : ni disque, ni `StorageService`, ni base.
Binivol garde le nom, la taille, l'empreinte SHA-256 et le rapport (compteurs, rejets et
avertissements, avec numéros de ligne et clés). Taille maximale 5 Mo ; signature vérifiée. Les
fichiers `*.xlsx` sont ignorés par Git, sauf les fixtures fictives de `tests/fixtures/`.

**Conséquences.** L'import réel demande de redéposer le fichier ; l'empreinte garantit que c'est
le même que celui de la simulation.

## ADR-023 — Les ID de l'ancien classeur vont dans `legacyRef`

**Contexte.** Les ID du classeur (`P-00001` pour un prospect, `S-…`, `F-…`) ressemblent aux
numéros lisibles de Binivol sans désigner la même chose.

**Décision.** Ils sont gardés dans `legacy_ref` (unique) de `candidacies`, `training_records` et
`appointments`, et servent de clé à l'import. Les `ref` de Binivol restent attribués par ses
séquences. Les personnes sont reconnues par leur NIVOL ; les lignes du Journal par
`audit_logs.legacy_hash`.

**Conséquences.** Un ID du classeur peut coïncider avec un `ref` de Binivol sans conséquence.

## ADR-024 — Oui/Non vide = inconnu

**Contexte.** Dans le classeur, une case Oui/Non vide signifie « on ne sait pas ».

**Décision.** `is_member`, `other_aasc`, `regular_minor_supervisor` (`persons`) et
`parental_authorization` (`person_sensitive`) deviennent nullables (défaut `false` pour une
saisie dans Binivol), comme `is_trainer`. L'import y écrit `null` pour une case vide.

**Conséquences.** Les écrans des étapes suivantes afficheront « Non renseigné » pour `null`.

## ADR-025 — Visibilité filtrée en SQL, testée contre `can()`

**Contexte.** L'annuaire ne doit jamais montrer une personne interdite, ni par le compteur ni par
la pagination. Charger tout le monde puis filtrer avec `can()` en mémoire ne tient pas à
l'échelle et fausse la pagination.

**Décision.** `src/server/policy/visibility.ts` traduit la matrice en conditions SQL sur
`persons p` (`visibleSql(actor, action)`, `directoryVisibilitySql`) : mêmes conditions que `can()`
(archivée, candidat, périmètres via formations et nominations actives, champ DIAMANT). La
condition est appliquée avant `count(*)` et avant la pagination par curseur. Un test sur base
(`visibility.db.test.ts`) compare, pour les 7 comptes du seed et les 15 actions portant sur une
personne, l'ensemble rendu par le SQL à celui de `can()` : ils doivent être identiques. Chaque
ligne passe encore par `can()` (défense en profondeur), et les droits par ligne (lien vers la
fiche, formations) viennent de `can()` sur des faits chargés par lot (`loadPersonFactsMany`).

**Conséquences.** Toute modification de `matrix.ts` ou de `relevesOf` doit être reportée dans
`visibility.ts` ; le test échoue sinon. Le nombre de requêtes d'une page est fixe (testé).

## ADR-026 — Couche de stockage `StorageService`

**Contexte.** Les documents sont testés sur Supabase puis iront sur un VPS. Pas de SDK Supabase.

**Décision.** Une interface `StorageService` (`put`, `get`, `delete`) et deux pilotes choisis par
`STORAGE_DRIVER` : `local` (un dossier, clés refusées si elles sortent du dossier) et `s3`
(n'importe quel service compatible S3 : Supabase Storage via son point d'accès S3, MinIO…). Une
seule dépendance : `@aws-sdk/client-s3`, client S3 officiel et générique, modulaire, maintenu,
sans lien avec un hébergeur ; le pilote est testé contre un double de test HTTP. Les clés sont
aléatoires (`documents/<année>/<32 hex>.<ext>`), jamais un nom de personne. Le fichier est
écrit **avant** la ligne `documents` ; si la base échoue, il est supprimé ; si le stockage
échoue, aucune ligne n'est créée.

**Conséquences.** Passer de Supabase à MinIO ou au disque d'un VPS est une affaire de variables.

## ADR-027 — Jamais d'URL publique ni présignée

**Contexte.** Une URL présignée, même courte, peut être transmise, mise en cache ou journalisée
ailleurs, sans contrôle des droits ni trace de consultation.

**Décision.** `StorageService` n'a aucune méthode qui rend une URL. Le navigateur ne voit que
`GET /api/documents/[id]`, qui vérifie `document.read` (et `document.archived.read` pour un
document archivé), écrit un `AccessLog` `DOCUMENT_VIEW`, puis renvoie le fichier en
`Content-Disposition: attachment`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`.
Le compartiment S3 est privé.

**Conséquences.** Chaque téléchargement passe par le serveur (sans incidence au volume de l'UL).

## ADR-028 — Données sensibles affichées à la demande

**Contexte.** La fiche doit permettre de lire la naissance, l'adresse, les personnes à prévenir,
le B3 et l'autorisation parentale, mais chaque lecture doit être tracée.

**Décision.** Rien de sensible n'est rendu par le serveur dans la page initiale. Le bloc est
replié ; le bouton « Afficher les données sensibles » appelle une action serveur
(`person.sensitive.read`) qui passe par `readPersonSensitive` : un `AccessLog` `SENSITIVE_VIEW`
par affichage, avec la mention « Cette consultation est enregistrée. ». Exception assumée :
l'**âge** et la pastille « Mineur » (et le filtre « Mineurs » de l'annuaire) sont dérivés de la
date de naissance par `sensitive.ts` (`agesOf`, `minorSql`) sans journalisation, car seule une
valeur dérivée sort du module, jamais la date.

**Conséquences.** Règle ajoutée à `CLAUDE.md` : jamais de donnée sensible dans le rendu initial
d'une page.

## ADR-029 — Modifications concurrentes : le dernier enregistrement l'emporte

**Contexte.** Deux responsables peuvent modifier la même fiche en même temps.

**Décision.** Pas de verrou optimiste à cette étape : le dernier enregistrement l'emporte,
champ par champ pour les champs envoyés. L'audit garde les deux modifications (ancienne et
nouvelle valeur de chacune), ce qui permet de reconstituer et corriger.

**Conséquences.** Simple et suffisant au volume de l'UL ; un contrôle de version pourra être
ajouté si des conflits apparaissent.

## ADR-030 — Nouvelles actions de la politique

**Contexte.** Deux règles de l'étape 5 visaient TOPAZE seul : corriger un NIVOL, voir un document
archivé. Aucun test de profil n'est permis hors de la politique.

**Décision.** Deux actions ajoutées à la matrice : `person.nivol.correct` et
`document.archived.read`, toutes deux TOPAZE. `docs/permissions.md` est régénéré.

**Conséquences.** Les écrans demandent `can()`, jamais le profil.

## ADR-031 — Fiche réduite pour FORMAT

**Contexte.** FORMAT gère les formations de tous (`training.read`) sans avoir accès à la fiche
complète (`person.full.read`). À l'étape 5, il ne voyait les formations que résumées dans
l'annuaire.

**Décision.** La fiche s'ouvre avec `person.full.read` **ou** `training.read`
(`personPageAccess()` dans la politique, et son miroir SQL `personPageSql()`, testé contre lui).
Avec `training.read` seul, elle montre un en-tête limité aux champs de l'annuaire (projection
`toReducedView`) et le seul onglet Formations ; aucun autre onglet, aucun bloc sensible, aucune
action. Les candidats restent invisibles pour FORMAT (404).

**Conséquences.** Dans l'annuaire, FORMAT ouvre les 54 fiches non candidates du seed, en version
réduite. `docs/permissions.md` décrit les deux fiches.

## ADR-032 — Machine de passage centralisée

**Contexte.** Les passages d'étape d'une candidature ont des règles (sauts limités, retour avec
note, abandon avec motif, reprise, finalisation) qui ne doivent pas se disperser entre écrans
et services.

**Décision.** Un module pur, `src/server/candidacy/machine.ts`, décide de chaque passage
(`decideTransition`) et liste ceux d'une étape (`availableTransitions`), avec les champs exigés.
Les services l'appliquent à chaque écriture ; l'interface ne montre que ses boutons. Un test
couvre les 49 couples d'étapes et la reprise depuis chaque étape d'abandon.

**Conséquences.** Changer une règle se fait à un seul endroit, et le tableau de
`docs/integration.md` se vérifie contre le test.

## ADR-033 — Contrôle de concurrence sur l'étape attendue

**Contexte.** Deux responsables peuvent faire avancer la même candidature en même temps.

**Décision.** Chaque passage porte l'étape affichée (`expectedStage`). La mise à jour est
conditionnelle (`updateMany … where stage = expectedStage`) : si l'étape a changé, rien n'est
écrit et le message est « La candidature a changé entre-temps : rechargez la page. ». Les autres
champs (prochaine action, notes…) suivent la règle « le dernier l'emporte » (ADR-029).

**Conséquences.** Pas de double passage ni d'événement en double (testé avec deux appels
simultanés).

## ADR-034 — Règle des doublons à la création d'un candidat

**Contexte.** Un candidat peut déjà être connu : ancien bénévole, candidature précédente,
homonyme.

**Décision.** Avant toute écriture, recherche sur tous les statuts par e-mail, téléphone
normalisé, ou nom et prénom sans accents ni casse. Les fiches trouvées sont proposées : réengager
(partie ou inactive), ouvrir la fiche (candidature en cours), ou « déjà bénévole ». Une fiche que
l'acteur ne voit pas dans l'annuaire est signalée sans aucun champ. « Créer quand même » est
tracé dans l'audit (`duplicateOverride`).

**Conséquences.** Le réengagement garde l'historique sur la fiche existante au lieu d'en créer
une seconde.

## ADR-035 — Exception : connexion démo sur un déploiement Vercel de test

**Contexte.** Le responsable du projet veut tester l'application en ligne (Vercel + Supabase)
sans configurer la connexion Google. La connexion démo y était interdite (le serveur refusait de
démarrer).

**Décision.** Exception explicite, décidée par le responsable du projet le 05/11/2026 : la
connexion démo est acceptée sur Vercel **seulement** si `AUTH_DEMO_ON_VERCEL=true` s'ajoute à
`AUTH_DEMO_LOGIN=true`. Dans ce mode (« démo hébergée », `isHostedDemo()`) :

- la base ne contient que le seed de démonstration (60 personnes fictives, 7 comptes
  `@binivol.test`) ;
- **l'import de classeur est refusé** (page et actions), pour qu'aucun vrai fichier ne puisse y
  être déposé ;
- les documents sont inactifs (pas de stockage S3 configuré) ;
- l'adresse est protégée par la protection de déploiement de Vercel.

**Conséquences.** Quiconque passe la protection Vercel entre comme TOPAZE, sur des données
fictives. Cette exception ne doit jamais s'appliquer à la base de production : la mise en ligne
réelle (étape 15) retire les deux variables et passe par Google.

## ADR-036 — Le build Vercel ne migre et ne seede qu'en production

**Contexte.** À l'étape 6, chaque déploiement (prévisualisations comprises) lançait
`prisma migrate deploy` et le seed démo : une branche aurait pu modifier la base partagée.

**Décision.** `planVercelBuild()` (pure, testée) : migrations seulement si
`VERCEL_ENV=production` ; seed démo seulement en production avec `AUTH_DEMO_LOGIN=true` et
`AUTH_DEMO_ON_VERCEL=true` ; `next build` toujours. Le script de seed revérifie la production.

**Conséquences.** Une prévisualisation qui apporte une migration peut échouer à l'exécution tant
que la migration n'est pas en production. C'est voulu : la base n'évolue que par `main`.

## ADR-037 — Fonctions Vercel en `cdg1` (Paris)

**Contexte.** Le premier déploiement tournait à Washington (`iad1`), loin de Supabase
(`eu-west-3`, Paris) : latence et données personnelles hors d'Europe pendant le traitement.

**Décision.** `vercel.json` fixe `"regions": ["cdg1"]`.

**Conséquences.** Requêtes plus rapides vers la base, traitement en Europe. Sur VPS, le
serveur sera aussi hébergé en France.

## ADR-038 — Le jeton du dossier est échangé contre un cookie

**Contexte.** Le candidat n'a pas de compte : un lien porte un jeton. Laissé dans l'adresse, il
finirait dans l'historique, les favoris, l'en-tête `Referer` et les captures d'écran.

**Décision.** Le jeton (32 octets aléatoires, base64url) n'est stocké que par son empreinte
SHA-256. L'ouverture du lien (route `/dossier/[token]`, remplacée par `/dossier/ouvrir#<jeton>`,
ADR-043) le vérifie, pose un cookie de session de dossier (`HttpOnly`,
`SameSite=Lax`, chemin `/dossier`, `Secure` en HTTPS, 2 h glissantes, signé HMAC avec une clé
dérivée d'`AUTH_SECRET`, contenant seulement l'identifiant du lien), puis redirige vers
`/dossier`. Les pages `/dossier*` envoient `Referrer-Policy: no-referrer`,
`Cache-Control: no-store` et `X-Robots-Tag: noindex`. Tout refus donne la même page neutre.

**Conséquences.** Le jeton ne quitte plus la première requête. Il reste visible dans les journaux
d'accès de l'hébergeur pour cette requête (point ouvert, `docs/dossier.md`). Les actions du
candidat sont des actions publiques (`definePublicAction`) qui relisent le cookie et le lien à
chaque appel.

## ADR-039 — Lien réutilisable jusqu'à l'envoi, puis fermé

**Contexte.** Un dossier se remplit rarement d'une traite. Un lien à usage strictement unique
obligerait à en renvoyer un à chaque reprise.

**Décision.** Le lien reste utilisable jusqu'à sa date de fin pour reprendre le brouillon.
L'envoi du dossier le marque utilisé (`usedAt`) : il ne s'ouvre plus. Un nouveau lien révoque les
précédents, et le brouillon déjà saisi le suit.

**Conséquences.** Une personne qui a le lien peut lire et modifier le brouillon tant qu'il n'est
pas envoyé : d'où une durée courte (7 jours par défaut), la révocation et l'avertissement « Ne
transférez pas ce message » dans l'e-mail.

## ADR-040 — Revue par DIAMANT avant tout report dans la fiche

**Contexte.** Le dossier est saisi par le candidat : fautes de frappe, champs mal compris, NIVOL
recopié d'un autre. Écrire directement dans la fiche mélangerait des données non vérifiées aux
données de l'unité.

**Décision.** Le dossier envoyé reste dans `dossier_submissions`. DIAMANT le compare à la fiche
(consultation journalisée) et choisit les champs à reporter ; les champs vides de la fiche sont
cochés par défaut. Le report tient en une transaction auditée. Le NIVOL et l'e-mail Croix-Rouge
déclarés ne sont jamais reportés (étape 9).

**Conséquences.** Une étape de plus pour DIAMANT, mais aucune donnée n'entre dans la fiche sans
un responsable. Le dossier envoyé reste la source des PDF de l'étape 8.

## ADR-041 — `MailService`, pilotes `smtp` et `log`

**Contexte.** L'architecture doit rester portable (Vercel puis VPS) : pas de SDK d'envoi propre
à un fournisseur. Les tests et la démo ne doivent rien envoyer.

**Décision.** `MailService` (`src/server/mail/`) avec deux pilotes : `smtp` (Nodemailer : Brevo
en test, relais du VPS ensuite) et `log` (par défaut), qui écrit le message chiffré dans
`outbound_mails`, lisible par TOPAZE dans `/admin/courriels`.

**Conséquences.** Changer de fournisseur ne demande que les variables `SMTP_*`. Le pilote `log`
sert aux tests e2e (le lien y est récupéré) sans jamais stocker un jeton en clair.

## ADR-042 — Seed de la démo hébergée : les personnes saisies hors seed sont conservées

**Contexte.** `seed:demo` refuse toute base contenant une personne sans la note du seed, pour ne
jamais mêler données fictives et réelles. Sur la démo hébergée, des testeurs créent des
candidats : le seed de l'étape 7 a donc été ignoré en production.

**Décision.** Quand `AUTH_DEMO_ON_VERCEL=true` (démo hébergée, ADR-035), la base est fictive par
définition : `seedDemo({ hostedDemo: true })` conserve les personnes créées hors seed sans les
modifier, les liste par référence dans le journal de build, et ajoute ou met à jour ses propres
données. Partout ailleurs, le refus strict reste inchangé.

**Conséquences.** La démo reçoit les données de chaque étape sans base neuve. Le journal de build
ne contient que des références (`P-000xx`), jamais de nom.

## ADR-043 — Le jeton du dossier passe après `#`

**Contexte.** Avec `/dossier/[token]`, le jeton figurait dans l'adresse de la première requête :
les journaux d'accès de l'hébergeur (Vercel, proxy du VPS) pouvaient le conserver (point ouvert
de l'étape 7).

**Décision.** Le lien devient `/dossier/ouvrir#<jeton>`. Le fragment n'est jamais envoyé au
serveur. La page lit le jeton côté navigateur, l'efface de l'adresse (`history.replaceState`),
puis l'envoie dans le corps d'un `POST` à l'action publique `openDossierLinkAction`, qui pose le
cookie (ADR-038). L'ancienne route est retirée : aucun vrai lien n'avait été envoyé.

**Conséquences.** Le jeton n'apparaît dans aucune adresse reçue ni dans aucun journal d'accès ;
un test e2e le vérifie. L'ouverture demande JavaScript (message `<noscript>` sinon), ce qui est
déjà le cas du formulaire.

## ADR-044 — Le lien est consommé à la signature, plus à l'envoi

**Contexte.** À l'étape 7, l'envoi du dossier marquait le lien utilisé. L'étape 8 ajoute la
signature après l'envoi : le candidat doit pouvoir revenir signer avec le même lien.

**Décision.** Entre l'envoi et la signature, le lien ne rouvre que les écrans de signature (le
formulaire n'est plus modifiable). `usedAt` est posé quand toutes les signatures requises sont
réunies : le bénévole, et le représentant légal pour un mineur. Un nouveau lien reprend le
dossier envoyé non signé.

**Conséquences.** Le lien reste actif plus longtemps qu'avant, mais il ne permet plus de changer
le contenu ; sa durée (7 jours) et la révocation restent les garde-fous.

## ADR-045 — `pdf-lib` pour remplir et aplatir les PDF officiels

**Contexte.** Les trois documents officiels sont des PDF AcroForm. Il faut les remplir, y poser
des signatures et rendre le résultat non modifiable, sans service externe ni binaire système.

**Décision.** `pdf-lib` (pur JavaScript, licence MIT) avec `@pdf-lib/fontkit` : remplissage par
nom exact de champ (`src/server/pdf/mappings.ts`), images de signature dans le rectangle du
champ, puis aplatissement (plus aucun champ, plus d'AcroForm). Les défauts des modèles sont
traités dans le code et documentés (champ à deux widgets de l'attestation, cases sans
apparence « Off »).

**Conséquences.** La génération tourne partout où Node tourne (Vercel, VPS). Les fichiers
finaux ont une empreinte stable une fois produits ; un test relit chaque PDF généré.

## ADR-046 — Police Unicode embarquée (Geist), et Caveat pour les noms saisis

**Contexte.** Les polices standard des PDF (WinAnsi) ne couvrent pas « Ł », « Ő » ou « Ș » :
un nom d'Europe de l'Est serait mal rendu.

**Décision.** Geist (OFL), embarquée en sous-ensemble dans chaque PDF, dans `assets/fonts/` avec
sa licence et son empreinte. Les signatures saisies au clavier sont dessinées en Caveat (OFL),
en deux sous-ensembles (latin, latin étendu) choisis caractère par caractère.

**Conséquences.** Les fichiers grossissent de quelques dizaines de Ko ; tous les noms
s'affichent.

## ADR-047 — Empreinte des modèles figée dans le code

**Contexte.** Un modèle remplacé par erreur (ou modifié) produirait des documents officiels
faux, sans que personne ne s'en aperçoive.

**Décision.** Le SHA-256 de chaque modèle de `assets/modeles/` (et des polices) est écrit dans
`src/server/pdf/templates.ts`. Un fichier différent bloque la génération avec un message clair ;
un test le vérifie.

**Conséquences.** Changer un modèle officiel est un changement de code relu (nouvelle empreinte,
mapping vérifié par le test de couverture des champs).

## ADR-048 — La copie bénévole n'est pas stockée une seconde fois

**Contexte.** Le bénévole reçoit ses trois PDF par e-mail ; l'unité locale garde sa copie.

**Décision.** Les PDF envoyés sont les mêmes fichiers que la copie UL : seule la copie UL est
rangée dans le stockage ; leur empreinte figure dans la preuve. « Renvoyer l'e-mail » relit la
copie UL et vérifie son empreinte avant l'envoi.

**Conséquences.** Pas de doublon de données personnelles dans le stockage ; un renvoi envoie
exactement les fichiers signés.

## ADR-049 — Pas de copie de diplôme stockée

**Contexte.** Le dossier en ligne de l'étape 7 acceptait des copies de diplômes. L'ancien outil
ne les gardait pas : Pegass, l'outil national, fait foi pour les diplômes. Une copie serait une
donnée personnelle conservée sans usage (minimisation, RGPD).

**Décision.** `DIPLOMA_COPY` est retiré des pièces du dossier, du formulaire et du choix de
l'onglet Documents ; les services refusent tout nouveau fichier de ce type
(`RETIRED_DOCUMENT_KINDS`). La valeur reste dans l'énumération pour les lignes existantes. Le
formulaire dit : « Tes diplômes seront vérifiés dans Pegass, tu n'as pas à les envoyer ».

**Conséquences.** Réversible : remettre la valeur dans `DOSSIER_ATTACHMENT_KINDS` et la retirer
de `RETIRED_DOCUMENT_KINDS`. Les diplômes déclarés (texte) restent demandés et reportables.

## ADR-050 — Binivol n'appelle jamais Gaia

**Contexte.** Gaia est l'outil national de la Croix-Rouge : il attribue le NIVOL et l'adresse
`@croix-rouge.fr`. Aucune interface ouverte n'est prévue pour une unité locale, et une
intégration automatique ferait sortir des données personnelles vers un système tiers sans cadre.

**Décision.** Binivol assiste la saisie manuelle : une fiche dans l'ordre de l'écran de Gaia
(lue à la demande, journalisée), « Copier » champ par champ ou « Tout copier », une liste à
cocher datée (paramètre `GAIA_CHECKLIST`). Le responsable saisit ensuite le résultat (NIVOL,
e-mail CRF) dans Binivol.

**Conséquences.** Aucune dépendance à Gaia ni secret à gérer ; la saisie reste humaine. Une
clôture faite par erreur s'annule par TOPAZE dans les 7 jours, motif obligatoire.

## ADR-051 — L'attestation d'aptitude est régénérée avec le NIVOL

**Contexte.** À la signature (étape 8), le NIVOL n'existe pas encore : le champ de l'attestation
reste vide. Il est connu à la clôture (étape 9).

**Décision.** Après la clôture, l'attestation est régénérée depuis le dossier signé et les
signatures stockées, avec le NIVOL de la fiche (jamais le NIVOL déclaré) : nouvelle version de la
copie UL, l'ancienne archivée, l'empreinte ajoutée aux `documentHashes` de chaque signature. Sans
stockage, la clôture n'est pas bloquée : « Compléter l'attestation » permet de réessayer.

**Conséquences.** La preuve PDF d'origine ne change pas (elle porte les empreintes des documents
signés) ; la nouvelle empreinte figure dans la base. Une annulation de la clôture archive cette
version et rétablit la précédente.

## ADR-052 — Un état unique par compétence, calculé en un seul endroit

**Contexte.** La fiche, l'annuaire, « Trouver » et bientôt la matrice (étape 13) affichent l'état
des formations ; dupliquer la règle mène à des écarts (une personne « valide » ici, « expirée »
là).

**Décision.** `src/server/qualification.ts` donne un seul état par personne et entrée du
référentiel (Valide, Valide sans date, Expire bientôt, Expirée, Inscrit, À confirmer, fonction en
cours ou terminée, Aucune) : lignes annulées ignorées, réussite la plus récente gagnante. Le SQL
de l'annuaire et de « Trouver » en est le miroir, testé contre lui sur le seed.

**Conséquences.** Toute évolution de la règle se fait dans ce module et dans son miroir SQL.

## ADR-053 — Avertir sans bloquer

**Contexte.** L'ancien outil laissait le terrain saisir : une date manquante ou un prérequis
non à jour ne doit pas empêcher d'enregistrer une formation réellement suivie.

**Décision.** Seules les vraies erreurs bloquent (format, obligatoire, dates incohérentes, hors
périmètre, mineur et fonction interdite). Les autres contrôles (`src/server/warnings.ts`) sont des
avertissements affichés avant l'enregistrement, calculés pour tout un groupe à la fois ;
« Enregistrer quand même » écrit la liste acceptée dans l'audit.

**Conséquences.** Les données peuvent contenir des situations signalées mais acceptées ; les
rappels (étape 12) et la matrice (étape 13) les font ressortir.
