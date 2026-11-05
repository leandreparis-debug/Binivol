# Déploiement (Vercel + Supabase, test)

Binivol se teste sur **Vercel** (application) et **Supabase** (PostgreSQL seul, aucun SDK), avant
une migration vers un VPS. Rien dans le code métier n'est propre à Vercel : seuls `vercel.json`
et le script `vercel-build` le sont.

## Région

Les fonctions tournent en **`cdg1` (Paris)**, fixé dans `vercel.json`, au plus près de la base
Supabase (`eu-west-3`, Paris) : moins de latence, et les données restent en Europe. Le build
peut s'exécuter ailleurs ; il ne fait que lire le code (et, en production seulement, migrer).

## Ce que fait le build

`pnpm vercel-build` (`scripts/vercel-build.ts`) exécute les étapes choisies par
`planVercelBuild()` (`src/server/deploy/buildPlan.ts`, testée) :

| `VERCEL_ENV`               | `AUTH_DEMO_LOGIN` et `AUTH_DEMO_ON_VERCEL` | Étapes                                           |
| -------------------------- | ------------------------------------------ | ------------------------------------------------ |
| `production`               | tous deux `true`                           | `prisma migrate deploy`, seed démo, `next build` |
| `production`               | sinon                                      | `prisma migrate deploy`, `next build`            |
| `preview`, autre ou absent | quelconques                                | `next build` seulement                           |

**Une prévisualisation de branche ne touche jamais au schéma ni aux données.** Conséquence
voulue : une prévisualisation qui contient une nouvelle migration peut ne pas fonctionner tant
que la migration n'est pas passée en production (fusion dans `main`). Le seed démo (ADR-035) a un
second garde-fou dans `scripts/hosted-demo-seed.ts`. Si la base contient des personnes saisies hors seed (par exemple un candidat créé
pendant les tests de la démo), le seed ne mélange pas : il est ignoré avec un message, et le build
continue (les migrations sont déjà appliquées).

## Règles

- Aucune commande ne modifie la base hébergée en dehors du build de production.
- Pas de `migrate reset`, de `db push`, ni de SQL d'écriture lancé à la main sur Supabase.
- Les secrets (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `SMTP_*`, `S3_*`) se saisissent
  directement dans Vercel, jamais dans une conversation, un commit ou un log.

## Variables (Vercel, production et preview)

| Variable                                 | Valeur (test)                                                                                        |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                           | pooler Supabase en mode transaction, port 6543, `pgbouncer=true&sslmode=require&uselibpqcompat=true` |
| `DIRECT_URL`                             | pooler Supabase en mode session, port 5432, `sslmode=require` (migrations)                           |
| `AUTH_SECRET`                            | secret aléatoire                                                                                     |
| `AUTH_DEMO_LOGIN`, `AUTH_DEMO_ON_VERCEL` | `true` (démo hébergée, ADR-035)                                                                      |
| `MAIL_DRIVER`                            | `log` (démo) ou `smtp` avec `SMTP_*` (`docs/mail.md`)                                                |
| `STORAGE_DRIVER`                         | non défini (documents inactifs) ou `s3` avec `S3_*` (`docs/storage.md`)                              |

L'application se connecte à Supabase avec un rôle dédié (`binivol_app`), propriétaire de ses
tables ; les rôles de l'API Supabase (`anon`, `authenticated`) n'ont aucun droit dessus.
