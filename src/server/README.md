# `src/server/` — couche d'accès aux données

Seul endroit du code qui parle à PostgreSQL. Les pages, Server Actions et Route Handlers
appellent cette couche ; ils n'importent jamais `@/generated/prisma/client` directement.

## Contenu (étape 2)

| Fichier                               | Rôle                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `db.ts`                               | client Prisma partagé (`getDb()`, adaptateur `pg`), types `Db`, `Tx`, `DbOrTx`, `inTransaction()`       |
| `audit.ts`                            | `withAudit(db, actor, fn)` : différentiel champ par champ, même transaction, valeurs sensibles masquées |
| `errors.ts`                           | `DomainError` et `translateDbError()` : contraintes → message français                                  |
| `sequences.ts`                        | numéros lisibles `P-`, `S-`, `F-` (`nextRef()`, `formatRef()`, `parseRef()`)                            |
| `reference.ts`                        | `computeExpiresAt()` : échéance d'une formation (mois ou 31/12)                                         |
| `perimeter.ts`                        | `computePerimeters()` (pur) et `perimetersOf()` (requête) : périmètres ACTION, LASER, FORMAT_GP         |
| `repositories/personRepository.ts`    | `findByRef()`, `search()` (sans accents, pagination par curseur), écritures techniques                  |
| `repositories/referenceRepository.ts` | `list({ kind, active })`, `findByCode()`                                                                |

## Connexion et droits (étape 3)

| Fichier                         | Rôle                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `auth/config.ts`                | Auth.js : Google, sessions en base, callback `signIn`, événements LOGIN / LOGOUT |
| `auth/adapter.ts`               | adaptateur minimal : ne crée jamais de compte, ne garde aucun jeton              |
| `auth/signIn.ts`                | règles de connexion, pures (`evaluateSignIn`, `handleSignIn`)                    |
| `auth/actor.ts`, `loadActor.ts` | `getActor()`, `requireActor()` : profils relus en base à chaque requête          |
| `auth/demo.ts`                  | connexion de démonstration (`@binivol.test`), jamais sur Vercel                  |
| `auth/page.ts`                  | `requirePageAccess()`, `authorizePage()` : 403 par `forbidden()`                 |
| `policy/`                       | `can()` (pure), `matrix.ts`, `loadPersonFacts()`, `docs/permissions.md` généré   |
| `actions/defineAction.ts`       | seul moyen d'écrire une action serveur                                           |
| `sensitive.ts`                  | **seul chemin** vers les données sensibles, avec `access_logs`                   |
| `projections/person.ts`         | vues annuaire et complète, jamais de champ sensible                              |
| `services/accounts.ts`          | comptes : ajout, profils, activation, garde-fous du dernier TOPAZE               |

## Annuaire et fiche (étape 5)

| Fichier                     | Rôle                                                                                         |
| --------------------------- | -------------------------------------------------------------------------------------------- |
| `policy/visibility.ts`      | `visibleSql()` : la matrice en SQL, testée contre `can()` (annuaire avant pagination)        |
| `policy/facts.ts`           | `loadPersonFactsMany()` : faits de la politique pour une page, en un nombre fixe de requêtes |
| `services/directory.ts`     | `listDirectory()` : recherche, filtres, compteur visible, pagination par curseur             |
| `services/personProfile.ts` | `lookupPerson()` (404/403), en-tête et onglets de la fiche, chacun autorisé par `can()`      |
| `services/personWrites.ts`  | statut, identité, correction de NIVOL, compétences annexes, langues, permis (audités)        |
| `services/documents.ts`     | dépôt (stockage puis base, sans orphelin), archivage, ouverture journalisée                  |
| `timeline.ts`               | `timelineOf()` : frise de la personne, filtrée par droit                                     |
| `storage/`                  | `StorageService`, pilotes `local` et `s3`, clés aléatoires (`docs/storage.md`)               |
| `documentFile.ts`           | signature binaire (PDF, JPEG, PNG), 10 Mo, nom d'origine nettoyé                             |
| `settings.ts`               | paramètres numériques (`ALERT_DAYS_BEFORE_EXPIRY`, `RETENTION_YEARS_AFTER_LEAVE`…)           |
| `trainingSummary.ts`        | état des qualifications (à jour, échéance proche, expirée, sans date), pur                   |

## À venir

- d'autres `services/` : la logique métier (intégration d'un candidat, rappels…), qui orchestre
  les repositories dans `withAudit()`.
- `MailService` (SMTP), avec une implémentation locale et une de production.

## Règles

- **Chaîne autorisée** : page / action / route → service → repository → Prisma.
- Un repository accepte `DbOrTx` : il fonctionne seul ou dans une transaction.
- Toute écriture métier passe par `withAudit()` ; les erreurs de base sont traduites par
  `translateDbError()` (ne jamais renvoyer ni journaliser l'erreur brute, qui peut contenir la
  ligne refusée).
- Les données sensibles (`PersonSensitive`, `EmergencyContact`, `Document`) ne sont jamais
  chargées par les listes.
- Aucun SDK Supabase, aucune dépendance propre à Vercel : PostgreSQL standard uniquement.
- Toute entrée est validée par Zod avant d'atteindre un service.
- Tests : fonctions pures dans `*.test.ts` (`pnpm test`), requêtes dans `*.db.test.ts`
  (`pnpm test:db`, vraie base).
