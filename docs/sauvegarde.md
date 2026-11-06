# Sauvegardes (étape 14, sans VPS)

## Aujourd'hui (Supabase)

La base de test est hébergée par Supabase. Selon l'offre (**à vérifier par Léandre** dans le
tableau de bord Supabase, rubrique « Database → Backups ») : sauvegardes quotidiennes
automatiques conservées quelques jours sur les offres payantes, restauration à un instant
précis en option ; l'offre gratuite n'en garantit pas. Ne pas compter dessus pour des données
réelles.

## À la main : `pnpm db:backup`

```bash
BACKUP_ENCRYPTION_KEY=… pnpm db:backup
```

- `pg_dump` au format custom de `DIRECT_URL` (sinon `DATABASE_URL`) : lecture seule ;
- chiffré en **AES-256-GCM** avec `BACKUP_ENCRYPTION_KEY` (32 octets, hexadécimal :
  `openssl rand -hex 32`), clé lue dans l'environnement, jamais écrite dans le dépôt ;
- fichier daté `binivol-AAAA-MM-JJTHH-MM-SSZ.dump.enc` dans `BACKUP_DIR` (`./backups`, non
  versionné, droits 600) ; seules les `BACKUP_KEEP` dernières copies sont gardées (8) ;
- le mot de passe de la base passe par `PGPASSWORD`, jamais sur la ligne de commande.

**Garde la clé ailleurs que les sauvegardes** (gestionnaire de mots de passe de l'UL) : sans
elle, une copie est illisible ; avec elle et la copie, tout est lisible.

## Restaurer : `pnpm db:restore <fichier>`

Déchiffre puis `pg_restore --clean` dans la base de `DATABASE_URL`, **uniquement locale**
(localhost, 127.0.0.1, ::1, `db`, `db-test`) et jamais avec `NODE_ENV=production` : même garde
que `db:fresh`. Pour vérifier une sauvegarde, restaure-la sur ton poste.

## Demain (étape VPS)

Un cron système lancera `pnpm db:backup` chaque nuit, copiera les fichiers chiffrés hors du
serveur (autre hébergeur), et une restauration d'essai mensuelle sera vérifiée. Rien n'est
automatisé sur Vercel cette nuit.
