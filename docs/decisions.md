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

## ADR-054 — Aucune copie du casier judiciaire (B3)

**Contexte.** Les encadrants réguliers de mineurs (`regularMinorSupervisor`) doivent avoir un
bulletin n° 3 vérifié chaque année. Une copie du casier est une donnée d'infraction (RGPD,
art. 10) : la conserver n'apporte rien à l'UL et crée un risque.

**Décision.** Binivol n'enregistre que la **date** de vérification, l'**issue** (`CLEAR` ou
`FLAGGED`) et **qui** a vérifié, dans `PersonSensitive` ; lecture par `sensitive.ts`
(journalisée). Une vérification par année civile. L'issue `FLAGGED` n'est lisible que par TOPAZE
(`b3.manage`) ; les autres profils voient « issue réservée à TOPAZE ». L'audit ne retient que la
date. Le dépôt d'un document `B3_ATTESTATION` est refusé, comme la copie de diplôme (ADR-049).

**Conséquences.** Pas de preuve documentaire dans Binivol : la preuve reste le bulletin montré
par la personne. Rétention : ces champs suivent la fiche, purgée `RETENTION_YEARS_AFTER_LEAVE`
ans (5 par défaut, paramètre) après le départ (`purgeEligibleAt`, étape 14).

## ADR-055 — Le compte rendu d'un point de suivi n'est pas une donnée sensible

**Contexte.** Le compte rendu d'un point de suivi (2 000 caractères au plus) décrit l'intégration
d'un bénévole. Le classer sensible imposerait un journal à chaque ouverture de l'onglet Suivi.

**Décision.** Le compte rendu est une donnée ordinaire de la fiche (onglet Suivi, profils
`followUp.manage`), **jamais affichée dans une liste** (tableau de suivi, exports) ni écrite dans
un e-mail. L'aide du champ rappelle de ne pas y écrire de donnée de santé ou d'infraction. La
liste des points est une section de `/candidats` (`/candidats/suivi`) : mêmes responsables
(DIAMANT, TOPAZE), pas de nouvelle entrée dans la navigation principale.

**Conséquences.** Si l'usage révèle des comptes rendus sensibles, il faudra les déplacer dans
`PersonSensitive` (nouvelle migration) et les lire par `sensitive.ts`.

## ADR-056 — Des alertes calculées, visibles par sujet

**Contexte.** L'ancien outil calculait des contrôles de qualité chaque semaine. Les stocker
imposerait de les tenir à jour à chaque écriture.

**Décision.** Les alertes sont **calculées à la demande** (`src/server/alerts/`) : fonctions
pures testées une à une, chargement groupé (sept requêtes, pas de N+1). Chaque règle a un
sujet ; chaque sujet est une action de la matrice (`alert.training.read`,
`alert.integration.read`, `alert.admin.read`, `reference.manage`), appliquée en SQL par
`visibleSql()`. Les rappels, eux, sont **datés et stockés** (`Notification`, dédoublonnés par
`dedupeKey`).

**Conséquences.** Une alerte disparaît d'elle-même ; ajouter une règle = une fonction pure,
un test, une ligne dans `ALERT_RULES`. Le coût est payé à l'affichage (moins d'une seconde
pour 500 personnes).

## ADR-057 — Une seule tâche quotidienne, derrière un secret et un verrou

**Contexte.** Le plan gratuit de Vercel n'autorise qu'un cron par jour ; plus tard, un cron
système sur le VPS.

**Décision.** Une route `GET|POST /api/taches/quotidienne` fait tout ; `Authorization: Bearer
<CRON_SECRET>` comparé en temps constant ; sans secret configuré, refus total. Verrou
`job_runs` (une ligne par tâche et par jour de Paris) ; chaque envoi est en plus dédoublonné.

**Conséquences.** Le passage au VPS ne change que l'appelant. Un jour manqué n'est pas
rattrapé automatiquement (les règles portent sur des échéances passées ou atteintes : le
lendemain les reprend).

## ADR-058 — Faits sensibles dérivés pour les alertes et les anniversaires

**Contexte.** Les règles ont besoin de l'âge, de la date du dernier B3, de l'autorisation
parentale ; les anniversaires, de savoir qui est né ce jour-là.

**Décision.** `sensitive.ts` expose `alertSensitiveFacts` et `birthdaysOn`, qui ne rendent que
des faits dérivés (âge, date du B3 sans l'issue, oui/non, liste d'identifiants), sans journal
d'accès, comme `agesOf` : personne ne consulte une valeur sensible. L'issue du B3 et la date
de naissance ne sortent jamais.

**Conséquences.** Le module sensible reste le seul à lire ces tables (test d'architecture).

## ADR-059 — Graphiques SVG faits main

**Contexte.** L'accueil a besoin de quelques barres (entonnoir, cohortes, flux). Une
bibliothèque de graphiques pèse des centaines de Ko et impose son accessibilité et son style.

**Décision.** Un composant `BarChart` écrit à la main en SVG : barres horizontales (libellés
longs lisibles), série secondaire hachurée, résumé textuel et tableau de données dépliable,
légende nommée. Pas de dépendance.

**Conséquences.** Pas d'axes fins ni d'animations ; suffisant pour des tableaux de bord
d'unité locale. Un graphique plus riche se discutera le jour où il sera nécessaire.

## ADR-060 — Exports journalisés, CSV neutralisé

**Contexte.** Un export fait sortir des données personnelles de l'application ; Excel exécute
une cellule qui commence par `=`.

**Décision.** Tout export passe par une route authentifiée et un service qui vérifie la
politique (`person.export`, `training.matrix.export`) et écrit l'`AccessLog` (qui, quand,
combien de lignes). Le CSV préfixe d'une apostrophe toute cellule commençant par `=`, `+`, `-`
ou `@`.

**Conséquences.** Un numéro de téléphone `+33…` apparaît `'+33…` dans Excel (affichage
inchangé) ; c'est le prix de la sûreté.

## ADR-061 — Purge validée à la main par défaut

**Contexte.** La purge RGPD est la seule suppression physique de l'outil, irréversible.

**Décision.** `PURGE_MODE=MANUAL` par défaut : la tâche quotidienne prévient TOPAZE, qui
valide sur `/admin/purge` en tapant « PURGER ». Chaque fiche est revérifiée au moment de la
purge (jamais une fiche non éligible, sauf effacement anticipé motivé par TOPAZE). Le mode
`AUTOMATIC` existe pour plus tard. Les fichiers sont supprimés après la transaction ; un échec
est gardé et retenté, il ne bloque pas la purge.

**Conséquences.** Une fiche éligible peut rester quelques jours de plus en base, le temps que
TOPAZE valide : c'est le prix d'une suppression sans surprise.

## ADR-062 — Journaux anonymisés, pas supprimés

**Contexte.** Les journaux sont en ajout seul et servent de preuve ; ils nomment la personne
purgée (identifiants, valeurs).

**Décision.** À la purge, dans la même transaction (`binivol.allow_purge`), les lignes qui la
concernent reçoivent un **pseudonyme aléatoire** (non dérivé de l'identifiant) et perdent
leurs valeurs ; une trace « 1 fiche purgée, par X, règle Y » est ajoutée. Les autres lignes ne
changent pas.

**Conséquences.** Le journal reste cohérent (qui a fait quoi, quand) sans plus permettre de
retrouver la personne.

## ADR-063 — Un ZIP écrit à la main pour l'export RGPD

**Contexte.** L'export d'une personne est une archive de quelques fichiers.

**Décision.** `src/server/zip.ts` écrit le format ZIP (deflate, noms UTF-8) avec `node:zlib`,
sans dépendance ; le résumé PDF est fait avec `pdf-lib`, déjà utilisé.

**Conséquences.** Pas de ZIP64 (archives de moins de 4 Go, largement suffisant).

## ADR-064 — Direction « Suisse » (rayons et pilules remplacés par l'ADR-066)

**Contexte.** La première direction artistique (Geist, cartes de rayon 24, boutons et
navigation en pilule) est remplacée par la direction « Suisse », validée par Léandre le
06/11/2026 sur le canevas https://claude.ai/artifact/CrnbH9ZGwWK5RHrRUyMiKM (page Maquettes,
ligne 01).

**Décision.** Grille nette, noir et blanc, un seul bleu pour signaler : fond `#F4F4F2`, cartes
blanches de rayon 12 sans ombre, encre `#0F0F0F`, accent `#1F5BFF` (et `accent-2` `#A9C1FF`
pour les hachures seulement). Boutons rayon 8, navigation rayon 6, plus de pilule (le rond reste
aux avatars, pastilles et compteurs). Titres en **Inter Tight 700** (−0,035em), texte en
**Inter**, polices chargées par `next/font/google` : téléchargées au build, servies par
l'application (aucune requête vers Google à l'exécution ; la CSP reste `font-src 'self'`). Le
paquet `geist` est retiré. Navigation principale : barre latérale (≥ 1024 px), rail
(640–1023 px), barre basse (téléphone). Mouvement discret (apparition, montée des barres,
survol, pression), neutralisé sous `prefers-reduced-motion`.

**Police mono : Geist Mono** (et non JetBrains Mono). Elle garde la continuité avec les PDF
officiels, remplis avec la Geist de `assets/fonts/` (empreinte figée, non modifiée par cette
refonte), et les NIVOL, références et codes gardent exactement leur mise en page actuelle
(largeurs de colonnes et cellules mono déjà réglées et testées) : pas de risque de régression
pour un gain visuel faible.

**Conséquences.** Les principes ne changent pas (le noir agit, l'accent signale ; une seule
StatCard highlight ; statut = pastille + libellé ; hachures réservées aux données). Deux
ajustements de contraste : texte sur `accent-soft` en `accent-ink`, StatCard highlight en accent
plein (le dégradé vers le nouvel `accent-2` serait illisible). Aucune modification de
`src/server/`, du schéma ni de la logique métier.

## ADR-065 — Logo « Point » en tracés SVG

**Contexte.** La piste A « Point » est validée le 06/11/2026 : « binivol » en minuscules, Inter
Tight 700, suivi d'un carré bleu ; l'icône est un carré encre avec un « b » blanc.

**Décision.** Les glyphes sont convertis **une fois** en chemins SVG (`pnpm logo:paths`, depuis
le fichier de la police, non stocké) et versionnés dans `src/components/brand/logoPaths.ts`. Le
composant `Logo.tsx` (variantes `full` et `mark`) et le script `pnpm icons` (favicon, icône Apple
180, manifeste 192 et 512, PNG pour les e-mails) partagent la même géométrie
(`logoGeometry.ts`).

**Conséquences.** Le logo est identique partout et ne dépend d'aucune police chargée (e-mails,
favicon, PDF). Changer le logo = relancer les deux scripts. Le PNG des e-mails est produit
(`public/brand/binivol-email.png`) ; il n'est pas encore inséré dans les modèles d'e-mail, qui
vivent dans `src/server/mail/` (hors du périmètre de cette refonte) : une ligne à ajouter en
tête du HTML des modèles.

## ADR-066 — Direction « Galet » (cartes arrondies, pilules, navigation flottante)

**Contexte.** Le 06/11/2026, le responsable du projet a jugé la direction « Suisse » trop
austère et fourni deux tableaux de bord de référence. Deux maquettes ont été proposées sur le
canevas https://claude.ai/artifact/1ghHKS95R4X3UQebu3XB1Q : A « Sobre » (fond gris chaud,
grandes cartes, pilules, accent bleu unique) et B « Couleur » (aplats lilas, citron, corail).
**La maquette A est retenue.**

**Décision.** On garde de l'ADR-064 la palette (encre, accent bleu unique, `accent-2` pour les
hachures), les polices et le mouvement. Changent : fond `#F0EEE9` (gris chaud ; `#EDEBE6` de la
maquette devient `veil`, car `accent` n'y atteint que 4,41 : 1), cartes de rayon 24, navigation
latérale en panneau blanc flottant de rayon 28, boutons, boutons-icônes, navigation, recherche,
onglets et étiquettes en pilule, champs en rayon 12, barres en rayon 8, chiffres clés à 44 px.
L'accueil reçoit la date du jour au-dessus du titre, des StatCard avec une flèche quand elles
sont des liens, et une liste « à faire » en lignes teintées. La recherche de la barre du haut
devient un vrai formulaire (elle ouvre l'annuaire avec `?q=`) ; le bouton-loupe précédent
n'avait pas d'action. La carte « Importer le classeur » de la navigation n'apparaît qu'à qui a
le droit `import.run` (calculé dans le layout, comme le menu du compte).

**Conséquences.** Les principes restent : le noir agit, l'accent signale ; une seule StatCard
highlight ; statut = pastille + libellé ; hachures réservées aux données ; pas d'ombre sur les
cartes. La règle « jamais de pilule » de l'ADR-064 est levée. La jauge et les cartes sombres de
la maquette (taux de formations à jour) demanderaient un nouvel indicateur dans
`src/server/services/dashboard.ts` : non fait dans cette refonte, purement visuelle.

## ADR-067 — « À faire » : listes personnelles et projets, sans passe-droit

**Contexte.** Léandre demande (06/11/2026) une liste de tâches par responsable, avec la
possibilité de confier une tâche, de la partager et de monter des projets d'équipe, sans
complexité (ni Gantt ni sous-sous-tâches).

**Décision.**

- **Visibilité relationnelle** : on voit une tâche si on en est l'auteur, un assigné actif ou
  un membre actif de son projet. **TOPAZE n'a pas de passe-droit** : ce sont des listes de
  travail personnelles et d'équipe, pas un outil de contrôle. Les règles restent dans la
  politique (`can()`, conditions `todoParticipant`, `todoManager`, `projectOwner`), avec un
  miroir SQL testé.
- Quatre actions au lieu des trois demandées : `todo.read`, `todo.write`, `todo.project.manage`,
  plus **`todo.manage`** (modifier, réattribuer, archiver une tâche : l'auteur ou un OWNER du
  projet), qui ne se confond ni avec cocher/commenter ni avec gérer un projet.
- **Une tâche partagée est faite dès qu'un assigné la coche** (`completed_by_id` dit qui) :
  une seule case, pas de « fait à 2 / 3 ».
- Une tâche sans assigné revient toujours à son auteur (création, refus, désactivation).
- Titres, notes et commentaires ne sont jamais écrits dans le journal d'audit (masqués) ;
  l'interface rappelle de ne pas y écrire de donnée sensible.
- Notifications dans la cloche seulement en V1 (pas d'e-mail).

**Conséquences.** Le menu gagne une entrée « À faire » (6 entrées en barre basse sur
téléphone). Un responsable qui quitte l'équipe ne bloque rien : désactiver son compte retire
ses assignations et transmet ses projets au membre le plus ancien.

## ADR-068 — Saisie assistée du dossier : adresses par le serveur, codes postaux embarqués

**Contexte.** Léandre demande (06/11/2026) des adresses proposées pendant la saisie du dossier,
des diplômes choisis dans une liste et la copie des valeurs à la réception.

**Décision.**

- Rues : **API Adresse de la Géoplateforme** (Base Adresse Nationale, IGN, service public
  gratuit sans clé). URL vérifiée le 06/11/2026 sur le service lui-même :
  `https://data.geopf.fr/geocodage/search` (paramètres `q`, `autocomplete=1`, `limit`,
  `index=address` ; réponse GeoJSON avec `name`, `postcode`, `city`, `type`) ; l'ancienne
  `api-adresse.data.gouv.fr` est remplacée par la Géoplateforme.
- Communes et codes postaux : fichier **local** tiré de la « Base officielle des codes postaux »
  de La Poste (data.gouv.fr, `laposte_hexasmal`, **Licence Ouverte 2.0** : réutilisation libre
  avec mention de la source), régénéré par `pnpm geo:postal-codes`. Pas de réseau pour ce cas.
- **Le navigateur n'appelle jamais un tiers** : `AddressService` (pilotes `ban`, `none`,
  `fake`) derrière une route serveur. La route est **`POST /dossier/adresse`** et non
  `/api/dossier/adresse` comme demandé : le cookie du dossier est limité au chemin `/dossier`
  (ADR-038) et l'élargir à tout le site affaiblirait sa protection. Le texte voyage dans le
  corps (les adresses de requête finissent dans les journaux de l'hébergeur), n'est jamais
  journalisé ni mis en cache ; limite par dossier.
- Diplômes : catalogue en paramètre (`DECLARED_DIPLOMA_CATALOG`), codes alignés sur le
  référentiel, ouverture « à vérifier dans Pegass » seulement sur proposition.

**Conséquences.** Le service public reçoit des morceaux d'adresse, sans nom ni identifiant :
la notice d'information le dit (à faire valider par le DPO). Avec `ADDRESS_PROVIDER=none`, la
fonction se réduit aux codes postaux locaux. Le fichier des codes postaux (≈ 850 Ko) est inclus
dans le serveur (`outputFileTracingIncludes`).

## ADR-069 — Tableau de bord DLUS : un indicateur = une condition SQL partagée avec l'annuaire

**Contexte.** Léandre demande (06/11/2026) que l'accueil de TOPAZE devienne une vue d'ensemble
de l'unité (effectifs opérationnels, inscriptions, arrivées), chaque chiffre ouvrant la liste
des personnes comptées.

**Décision.**

- Chaque indicateur est une **définition paramétrable** (`DASHBOARD_INDICATORS` : libellé,
  type « qualification valide » ou « inscription en cours », codes requis et exclus) traduite
  en **une** condition SQL (`src/server/dashboard/indicators.ts`). Le tableau de bord compte
  avec `directoryConditions()` de l'annuaire (visibilité d'abord) plus cette condition ;
  l'annuaire filtre `?indicateur=` avec la même : même filtre, même total, par construction et
  par test.
- Un droit dédié, `dashboard.dlus.read` (TOPAZE), plutôt qu'un test de profil.
- Référentiel : ajout de `I_GQS`, `I_IPS`, `I_IPSEN` (seed:base). **Hypothèses à confirmer** :
  le « GQS » de l'ancien classeur est la formation suivie, pas le droit de l'enseigner ; le
  référentiel n'a qu'un `PSE` (pas de niveaux), donc pas de « dont PSE2 » et un stagiaire
  secours est un inscrit à une session PSE ; « Confirmé » = inscription issue d'une liste
  d'attente.
- La variation sur 12 mois reconstruit le passé sans statut historisé (entrée et départ).

**Conséquences.** Changer une définition change à la fois le chiffre et la liste. Les trois
initiateurs de démonstration entrent dans le périmètre FORMAT GP.
