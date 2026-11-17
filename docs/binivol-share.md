# Partage avec Binitenue (`binivol_share`)

Binitenue (gestion des tenues de l'unité) partage la base PostgreSQL de Binivol. Binivol lui
publie, dans le schéma **`binivol_share`**, des **vues en lecture seule** et une fonction. C'est
ce document qui fait foi pour le contrat ; Binitenue s'y aligne (`src/server/binivol/contract.ts`
dans son dépôt).

Migration : `prisma/migrations/20261117090000_binivol_share`. Test : `src/test/db/binivolShare.db.test.ts`.

## Rôles

| Rôle                   | Droits                                                                                        | Créé par                         |
| ---------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- |
| `binivol_share_reader` | `USAGE` sur `binivol_share`, `SELECT` sur ses vues, `EXECUTE` sur `account_password_hash`     | La migration (si `CREATEROLE`)   |
| `binitenue_app`        | Connexion de Binitenue : membre de `binivol_share_reader`, propriétaire du schéma `binitenue` | À la main, une fois (ci-dessous) |

`binitenue_app` n'a **aucun droit** sur les tables de Binivol (`public`) : les vues s'exécutent
avec les droits de leur propriétaire.

Création, une fois, par le responsable (le mot de passe vient d'un fichier, jamais d'un
terminal ni d'une conversation) :

```sql
CREATE ROLE binitenue_app LOGIN PASSWORD '<mot de passe>';
GRANT binivol_share_reader TO binitenue_app;
GRANT CONNECT ON DATABASE <base> TO binitenue_app;
CREATE SCHEMA binitenue AUTHORIZATION binitenue_app;
```

## Vues

| Vue              | Contenu                                                                                                    |
| ---------------- | ---------------------------------------------------------------------------------------------------------- |
| `volunteers`     | Personnes hors candidats et hors archivées. **Adresse non publiée** (colonnes nulles : donnée sensible)    |
| `appointments`   | Nominations de ces personnes, avec `function_code` et `function_label` du référentiel, `cancelled`         |
| `qualifications` | Formations réussies (`VALID` ou `EXPIRED` selon `expires_at`, en Europe/Paris) ou en cours (`IN_PROGRESS`) |
| `accounts`       | Comptes de responsables : `id`, `email`, `name`, `active`, `username`, `profiles` (tableau de profils)     |

`volunteers.last_activity_at` est la date la plus récente entre la fiche, une formation réussie,
un point de suivi fait et une nomination.

## Mot de passe partagé

`binivol_share.account_password_hash(identifiant)` renvoie `account_id` et le hash argon2id
d'**un seul** compte, celui dont l'identifiant correspond exactement (casse et espaces ignorés).
Elle ne liste jamais les hash. Binitenue vérifie le mot de passe elle-même, avec les mêmes
paramètres (ADR-070) : un responsable se connecte aux deux applications avec le même identifiant
et le même mot de passe. Un changement de mot de passe dans Binivol vaut aussitôt pour Binitenue.

## Faire évoluer le contrat

Ajouter une colonne ne casse rien. Supprimer, renommer ou changer le type d'une colonne casse
Binitenue : prévenir avant, et la faire évoluer en même temps. Toujours par une nouvelle
migration.
