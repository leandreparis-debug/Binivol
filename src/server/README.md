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

## À venir

- `services/` : la logique métier (intégration d'un candidat, rappels…), qui orchestre les
  repositories dans `withAudit()` et applique les droits par profil (étape 3).
- `interfaces/` : `StorageService` (fichiers) et `MailService` (SMTP), avec une implémentation
  locale et une de production.

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
