# Import de l'ancien classeur (v03)

Guide de l'import réel, pour le DLUS (compte TOPAZE). L'import reprend le classeur Google Sheets
« v03 » dans Binivol. Il se fait **une fois**, sur la base de production, après l'accord du DPO.
Il est rejouable : relancer le même fichier ne change rien.

Le fichier n'est **jamais conservé** : il est lu en mémoire. Binivol ne garde que son nom, sa
taille, son empreinte et le rapport.

## 1. Prérequis

1. **L'accord écrit du DPO** pour la reprise des données (C3 confidentiel).
2. **Une base de production neuve**, migrée, avec le seul seed de base :

   ```bash
   pnpm db:deploy
   pnpm db:seed:base
   ```

   Jamais `db:seed:demo` en production : il crée des comptes et des personnes fictifs (il refuse
   d'ailleurs une base qui contient de vraies personnes).

3. **Le premier compte TOPAZE** (voir `docs/auth.md`) :

   ```bash
   pnpm admin:grant prenom.nom@croix-rouge.fr TOPAZE --name "Prénom Nom"
   ```

4. Optionnel mais conseillé : les comptes des éditeurs de l'ancien classeur, créés depuis
   `/admin/comptes`. Une annulation de nomination signée d'un e-mail qui correspond à un compte
   est alors rattachée à ce compte.

## 2. Exporter le classeur

Dans Google Sheets : **Fichier → Télécharger → Microsoft Excel (.xlsx)**. Ne pas renommer les
onglets ni les intitulés de colonnes. Ne pas protéger le fichier par mot de passe. Taille
maximale : 5 Mo.

Garder ce fichier sur le poste le temps de l'import, puis le **supprimer** (il contient des
données C3). Ne jamais le déposer dans le dépôt Git (`*.xlsx` est ignoré, sauf les fixtures
fictives de `tests/fixtures/`).

## 3. Simulation

1. Se connecter avec le compte TOPAZE, menu du compte → **Importer le classeur**
   (`/admin/import`).
2. Déposer le fichier, puis **Lancer la simulation**. Rien n'est écrit.
3. Lire le rapport :
   - les **cartes chiffres** : lignes créées, mises à jour, inchangées, ignorées pour conflit,
     rejetées ;
   - le **tableau par onglet** ;
   - la **liste des rejets et avertissements** (onglet, ligne du classeur, clé, motif),
     filtrable par niveau et par onglet.
4. Corriger dans le classeur ce qui doit l'être, réexporter, relancer la simulation.

Que corriger :

| Message                                           | Action                                                    |
| ------------------------------------------------- | --------------------------------------------------------- |
| Erreur bloquante : onglet ou colonne manquante    | rétablir l'onglet ou l'intitulé exact, puis réexporter    |
| NIVOL invalide, NIVOL en double                   | corriger le NIVOL (11 chiffres suivis d'une lettre)       |
| NIVOL inconnu, code inconnu (Sessions, Fonctions) | corriger la ligne, ou l'accepter rejetée                  |
| Date illisible                                    | corriger au format `JJ/MM/AAAA`, ou laisser vide          |
| Téléphone illisible, gardé tel quel               | corriger le numéro (10 chiffres), ou l'accepter tel quel  |
| Parti(e) sans date de départ                      | renseigner la date si elle est connue                     |
| Différent du référentiel de Binivol               | vérifier : le référentiel de Binivol n'est pas écrasé     |
| Nomination d'un mineur à une fonction interdite   | vérifier l'historique ; la ligne est reprise              |
| Paramètre non repris                              | rien à faire (dossiers Drive, version, éditeurs, alertes) |
| Onglet « Listes » non repris                      | rien à faire (listes déroulantes de l'ancien classeur)    |

Un rejet n'empêche pas l'import : la ligne rejetée n'est simplement pas reprise. Seules les
erreurs bloquantes l'empêchent.

## 4. Import réel

1. Dans les **30 minutes** qui suivent la simulation, avec **le même fichier** et le même
   compte, cliquer sur **Importer**.
2. Confirmer : « Vous allez importer N personnes. L'accord du DPO a-t-il été donné ? ».
3. L'import tient en une seule transaction : tout est écrit, ou rien. Un second import lancé en
   même temps est refusé.
4. Télécharger le **rapport CSV** depuis l'historique et le conserver avec l'accord du DPO.

En ligne de commande (exploitation, même règles, auteur « CLI ») :

```bash
pnpm import:classeur chemin/vers/classeur.xlsx --dry-run
```

```bash
pnpm import:classeur chemin/vers/classeur.xlsx
```

## 5. Vérifications après import

- [ ] Le nombre de bénévoles correspond au classeur (onglet Benevoles, moins les lignes
      rejetées du rapport) : `/benevoles` à partir de l'étape 5, ou `pnpm db:studio`.
- [ ] Cinq fiches prises au hasard : identité, statut, dates, aptitude, formateur.
- [ ] Les prospects sont en candidats, et celui qui a un « NIVOL attribué » est rattaché au
      bénévole, sans doublon.
- [ ] Quelques formations et nominations : code, date, résultat, annulations.
- [ ] Les périmètres : une personne titulaire du PSE est visible par ACTION et LASER, une
      personne « Formateur » par FORMAT GP (`/moi` des comptes concernés, ou l'annuaire à
      l'étape 5).
- [ ] Les téléphones : affichés `06 12 34 56 78` sur les fiches (le 0 de tête a été rétabli).
- [ ] Les nominations sans date de début apparaissent « actives » sur les fiches.
- [ ] Le journal importé : quelques lignes, avec les valeurs sensibles masquées et les dates
      lisibles.
- [ ] Relancer la simulation du même fichier : tout doit être « inchangé ».
- [ ] Supprimer le fichier `.xlsx` du poste.

## 6. Si l'import réel échoue

- **Rien n'a été écrit** : l'import est annulé en entier. L'historique affiche « Échec » avec le
  message.
- « Un autre import est déjà en cours » : attendre la fin de l'autre import, puis relancer une
  simulation et l'import.
- « lancez d'abord une simulation » ou « ce fichier n'est pas celui de la dernière simulation » :
  relancer la simulation avec le fichier exact, puis importer dans les 30 minutes.
- Erreur technique : noter le message de l'historique, ne pas modifier la base à la main, et
  transmettre le message (sans le fichier) pour analyse. Une fois corrigé, relancer simulation
  puis import : l'import étant idempotent, ce qui a déjà été repris restera « inchangé ».
- Après un import réussi, une ligne modifiée dans Binivol n'est plus jamais écrasée par un
  nouvel import (« ignorée pour conflit »).
