# Mise en service : avant de mettre de vraies données

La démo actuelle tourne avec des données **fictives** (Vercel + Supabase de test). Avant la
moindre donnée réelle, chaque point ci-dessous doit être fait et coché. **Qui** le fait et
**où** sont indiqués.

| #   | Point                                                                                                                                                                         | Qui           | Où                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------- |
| 1   | Accord écrit du DPO de la Croix-Rouge française (ou de la délégation territoriale) sur le traitement, le registre (`docs/rgpd.md`) et le texte d'information (`RGPD_NOTICE`)  | Léandre, DLUS | Échange avec le DPO                                 |
| 2   | Hébergement au nom de l'UL : équipe Vercel **de l'UL** (pas une équipe d'entreprise ni personnelle), base PostgreSQL en France (Supabase `eu-west-3` aujourd'hui, VPS demain) | Léandre       | Vercel → Settings → Team ; Supabase → Project       |
| 3   | Stockage des documents configuré (`STORAGE_DRIVER=s3` et les variables `S3_*`, compartiment **privé**)                                                                        | Léandre       | Vercel → Project → Settings → Environment Variables |
| 4   | Envoi d'e-mails réel (`MAIL_DRIVER=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`) et un essai d'envoi                                            | Léandre       | Vercel → Environment Variables                      |
| 5   | `CRON_SECRET` (32 caractères aléatoires ou plus) pour la tâche quotidienne ; vérifier sa première exécution dans `/admin/reglages`                                            | Léandre       | Vercel → Environment Variables ; Binivol → Réglages |
| 6   | Connexion Google : `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, URL de retour autorisée                                                                             | Léandre       | Google Cloud Console ; Vercel                       |
| 7   | **Retirer** `AUTH_DEMO_LOGIN` et `AUTH_DEMO_ON_VERCEL` (la connexion démo disparaît, l'import du classeur redevient possible)                                                 | Léandre       | Vercel → Environment Variables                      |
| 8   | Partir d'une base vide : migrations et `db:seed:base` **seulement** (jamais `db:seed:demo`)                                                                                   | Léandre       | Build de production (`pnpm vercel-build`)           |
| 9   | Comptes des responsables créés avec leurs profils (au moins deux TOPAZE)                                                                                                      | DLUS (TOPAZE) | Binivol → Gérer les comptes                         |
| 10  | Paramètres relus : nom et ville de l'UL, adresse de contact, délais, textes                                                                                                   | DLUS          | Binivol → Paramètres de l'UL, Réglages              |
| 11  | Import du classeur réel, d'abord en simulation, puis pour de bon ; vérifier quelques fiches                                                                                   | DLUS          | Binivol → Importer le classeur                      |
| 12  | Sauvegarde vérifiée : `pnpm db:backup` avec une clé gardée hors du serveur, puis `pnpm db:restore` sur un poste local                                                         | Léandre       | Poste de Léandre (`docs/sauvegarde.md`)             |
| 13  | Les guides (`/aide`) présentés aux responsables                                                                                                                               | DLUS          | Réunion d'équipe                                    |
