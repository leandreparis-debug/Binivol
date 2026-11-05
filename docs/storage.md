# Stockage des documents

Les fichiers (justificatifs aujourd'hui ; signatures et PDF signés aux étapes suivantes) passent
par une seule interface, `StorageService` (`src/server/storage/`). Le pilote se choisit par
variable d'environnement, sans changer le code : `STORAGE_DRIVER=local` ou `STORAGE_DRIVER=s3`.

Données personnelles C3 : **aucun fichier n'est public**, aucun n'entre dans Git.

## Ce qui est stocké

| Où                    | Quoi                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------- |
| Stockage              | le fichier, sous une clé aléatoire `documents/<année>/<32 caractères hex>.<pdf/jpg/png>` |
| Table `documents`     | type, clé, nom d'origine nettoyé, type MIME détecté, taille, SHA-256, expiration         |
| Journal `audit_logs`  | dépôt et archivage, avec nom, clé et empreinte **masqués**                               |
| Journal `access_logs` | chaque téléchargement (`DOCUMENT_VIEW`)                                                  |

La clé ne contient jamais le nom de la personne. Un fichier n'est accepté que s'il est un PDF, un
JPEG ou un PNG d'après sa **signature binaire** (ses premiers octets), 10 Mo au maximum : un
`.exe` renommé `.pdf` est refusé. Un document n'est jamais supprimé : il est archivé (visible par
TOPAZE seulement).

## Pilote `local` (développement, VPS)

```bash
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=./storage
```

- Le dossier est créé au premier dépôt ; les fichiers sont écrits en mode `600`.
- Toute clé qui sortirait du dossier (`..`, chemin absolu, antislash) est refusée avant
  d'accéder au disque.
- `./storage/` est ignoré par Git et par Docker.
- **Sur un VPS** : un dossier hors de l'application, par exemple `/var/lib/binivol/storage`,
  appartenant à l'utilisateur du service, droits `700`. En Docker, un volume nommé monté sur ce
  chemin.

### Sauvegarde sur VPS

Le dossier se sauvegarde **avec** la base, au même moment, pour que les lignes `documents` et
les fichiers restent cohérents :

```bash
pg_dump --format=custom "$DIRECT_URL" > binivol-$(date +%F).dump
```

```bash
tar --create --gzip --file binivol-storage-$(date +%F).tar.gz -C /var/lib/binivol storage
```

Les deux archives contiennent des données C3 : chiffrées (par exemple `age` ou `gpg`) et
conservées hors du serveur, avec la durée de rétention décidée avec le DPO. Restauration : la
base, puis le dossier ; un document dont le fichier manque s'affiche « Fichier absent ».

## Pilote `s3` (Supabase Storage en test, MinIO ou autre ensuite)

```bash
STORAGE_DRIVER=s3
S3_ENDPOINT=https://<projet>.supabase.co/storage/v1/s3
S3_REGION=<région du projet>
S3_BUCKET=binivol-documents
S3_ACCESS_KEY_ID=<clé>
S3_SECRET_ACCESS_KEY=<secret>
S3_FORCE_PATH_STYLE=true
```

Le pilote utilise le client S3 générique `@aws-sdk/client-s3` (ADR-026), **jamais le SDK
Supabase**. Les cinq premières variables sont obligatoires avec `s3` : le serveur refuse de
démarrer sinon.

### Configurer Supabase Storage

1. Tableau de bord du projet → **Storage** → **New bucket** : nom `binivol-documents`,
   **Public bucket décoché** (compartiment privé). Pas de politique d'accès anonyme.
2. **Storage → Settings → S3 Connection** : activer la connexion S3, recopier **le point d'accès
   affiché** (`S3_ENDPOINT`, de la forme `https://<projet>.supabase.co/storage/v1/s3`) et la
   région (`S3_REGION`). Les libellés du tableau de bord peuvent changer : se fier à la page S3
   Connection.
3. Même page, **S3 Access Keys → New access key** : noter l'identifiant et le secret
   (`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`), puis les mettre dans les variables Vercel
   (Production et Preview), jamais dans le dépôt.
4. Garder `S3_FORCE_PATH_STYLE=true`.

Ces clés donnent accès à tous les compartiments du projet : à réserver au serveur.

### MinIO ou autre service compatible

Même variables : point d'accès du service, région (`us-east-1` pour MinIO par défaut),
compartiment privé, clés d'un compte limité à ce compartiment. `S3_FORCE_PATH_STYLE=true` pour
MinIO.

## Pourquoi jamais d'URL publique ni présignée

Une URL publique ou présignée se transmet, se met en cache et se retrouve dans des journaux
hors de Binivol : elle échappe au contrôle des droits et à la trace de consultation. Le
navigateur ne connaît donc que `GET /api/documents/<id>`, qui :

1. vérifie la session et `document.read` sur la personne (et `document.archived.read` pour un
   document archivé) ;
2. écrit un `AccessLog` `DOCUMENT_VIEW` ;
3. renvoie le fichier avec `Content-Disposition: attachment`, `Cache-Control: no-store` et
   `X-Content-Type-Options: nosniff`.

`StorageService` n'a d'ailleurs aucune méthode qui produise une URL (ADR-027).

## Erreurs

| Situation                              | Résultat                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------- |
| Stockage injoignable au dépôt          | message « Le stockage des documents est injoignable… », aucune ligne créée |
| Base en échec après le stockage        | le fichier déposé est supprimé (pas d'orphelin)                            |
| Fichier absent (seed, import)          | « Fichier absent » dans la fiche, 404 au téléchargement                    |
| Stockage injoignable au téléchargement | 503 avec un message clair                                                  |
