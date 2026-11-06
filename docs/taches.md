# Tâches planifiées (étape 12)

Une **route unique**, appelée une fois par jour, fait tout le travail planifié : rappels,
relances de dossier, récapitulatifs d'alertes, e-mails d'anniversaire.

## La route

`POST /api/taches/quotidienne` (cron système) et `GET /api/taches/quotidienne` (Vercel Cron),
code dans `src/app/api/taches/quotidienne/route.ts` → `runDailyTask`
(`src/server/services/automation.ts`).

- En-tête obligatoire : `Authorization: Bearer <CRON_SECRET>`, comparé en temps constant
  (`src/server/cron.ts`, empreintes SHA-256 des deux côtés).
- **Sans `CRON_SECRET` configuré, la route refuse tout** (503) et l'écrit dans les logs, sans
  aucune valeur. Mauvais secret : 401.
- **Idempotente** : une ligne `job_runs` par tâche et par jour de Paris (unique). Relancée le
  même jour, elle répond `already` et ne fait rien. Une exécution en échec peut être relancée ;
  chaque étape est elle-même dédoublonnée (notifications par `dedupeKey`, e-mails par
  `automated_messages.dedupe_key`).
- Le code métier ne dépend pas de Vercel.

## Aujourd'hui : Vercel Cron

`vercel.json` déclare **un** cron quotidien à **05:00 UTC** (le plan gratuit n'en autorise
qu'un par jour). Vercel envoie lui-même `Authorization: Bearer $CRON_SECRET` quand la
variable `CRON_SECRET` existe dans le projet.

**À faire par Léandre** : créer la variable `CRON_SECRET` dans Vercel (Production), 32
caractères aléatoires au moins (`openssl rand -hex 32`), puis redéployer. Ne jamais l'écrire
ailleurs.

## Demain : cron système (VPS)

```cron
0 6 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://binivol.exemple.org/api/taches/quotidienne
```

Le secret vient de l'environnement du service (fichier protégé, jamais versionné).

## Suivi

`/admin/reglages` (TOPAZE) montre les 7 dernières exécutions et les e-mails automatiques en
échec (type, date, erreur générique ; jamais d'adresse ni de contenu).
