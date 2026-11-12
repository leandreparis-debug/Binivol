# Connexion et comptes

Seuls les responsables de l'unité locale se connectent, avec un **identifiant et un mot de
passe personnels**. Les bénévoles et les candidats n'ont jamais de compte. Un compte est ouvert
par TOPAZE, qui envoie à la personne un **lien d'invitation** ; elle y choisit son mot de passe.
Un responsable ne peut se connecter que si son compte est actif et a au moins un profil. Les
règles d'accès sont décrites dans `docs/permissions.md`. Décision : ADR-070.

## Fonctionnement

- **Auth.js** (`next-auth` 5.0.0-beta.32, épinglée) **sans fournisseur** : il lit, renouvelle et
  ferme les sessions. Les fournisseurs « identifiants » d'Auth.js ne fonctionnent pas avec les
  sessions en base : la connexion crée donc la session et le cookie elle-même
  (`src/server/auth/session.ts`), avec le nom, la durée et les options d'Auth.js.
- **Sessions en base** (table `sessions`) : 12 h, renouvelées après chaque heure d'activité.
  Désactiver un compte ou changer son mot de passe supprime ses sessions : la coupure est
  immédiate.
- Cookie de session `HttpOnly`, `SameSite=Lax`, `Secure` et préfixé `__Secure-` en HTTPS.
- La session ne contient que l'identifiant interne, le nom et l'e-mail. **Les profils sont
  relus en base à chaque requête** : un profil retiré ou un compte désactivé prend effet tout de
  suite.
- **Mots de passe** : hachés en **argon2id** (`@node-rs/argon2`, 19 Mio, 2 passes), jamais
  stockés ni journalisés en clair. 12 à 128 caractères, sans règle de composition, sans
  l'identifiant. Une phrase de plusieurs mots est idéale.
- **Identifiant** : 3 à 40 caractères, minuscules sans accent, chiffres, `.`, `-`, `_`. Fixé par
  TOPAZE à l'invitation ou choisi par la personne. La saisie à la connexion ignore la casse.
- **Connexion** (`/connexion`, `src/server/auth/passwordSignIn.ts`) : un identifiant inconnu,
  un compte sans mot de passe et un mauvais mot de passe reçoivent le même message
  (« Identifiant ou mot de passe incorrect. »), dans le même temps. Un compte désactivé ou sans
  profil est refusé, et dit, seulement une fois le mot de passe juste.
- **Limitation** (`rate_limits`) : 30 tentatives par client et par quart d'heure ; **5 échecs par
  identifiant** et par quart d'heure, quel que soit le client (l'identifiant est alors bloqué
  jusqu'à la fin de la fenêtre, même avec le bon mot de passe). Les clés sont des empreintes :
  ni adresse IP ni identifiant en clair dans la table.
- **Journal d'audit** : `LOGIN` (méthode `password` ou `demo`), `LOGIN_DENIED` (identifiant
  saisi et motif : `bad_credentials`, `rate_limited`, `inactive`, `no_profile`), `LOGOUT`,
  création d'un lien, mot de passe défini ou changé, lien utilisé. Jamais de mot de passe, de
  jeton ni d'empreinte.

## 1. Liens d'invitation et de nouveau mot de passe

Un lien d'accès (`/acces#<jeton>`) permet de choisir son mot de passe (et son identifiant s'il
n'a pas été fixé). Il est :

- **à usage unique** : il ne fonctionne plus une fois le mot de passe enregistré, même si deux
  personnes l'ouvrent en même temps ;
- **à durée limitée** : 7 jours pour une invitation, 24 h pour un nouveau mot de passe ;
- **remplacé** par tout nouveau lien du même compte (l'ancien cesse de fonctionner) ;
- **inutilisable** pour un compte désactivé ;
- **jamais stocké** : la base ne garde que son empreinte SHA-256 (`account_tokens`). Le jeton est
  après le `#` : le navigateur ne l'envoie pas au serveur, la page l'efface de la barre
  d'adresse et le transmet dans le corps d'une requête POST.

Un mot de passe trop court ou un identifiant déjà pris ne consomme pas le lien. Enregistrer un
mot de passe ferme toutes les sessions du compte, puis renvoie vers `/connexion`.

**Depuis l'app** (TOPAZE, menu du compte → **Gérer les comptes**, `/admin/comptes`) :

- **Inviter un responsable** : adresse e-mail, nom, identifiant (facultatif) et profils. Le lien
  d'invitation s'affiche **une seule fois**, avec un bouton **Copier**. Si `MAIL_DRIVER=smtp`, il
  est aussi envoyé par e-mail ; avec `MAIL_DRIVER=log` (serveur de test), rien ne part :
  copiez-le et transmettez-le par un canal sûr.
- **Nouveau lien d'invitation** (compte sans mot de passe) ou **Lien de nouveau mot de passe**
  (mot de passe oublié) : même mécanisme. L'ancien mot de passe reste valable jusqu'à
  l'utilisation du lien. Il n'existe pas de « mot de passe oublié » en libre-service : la
  personne demande un lien au DLUS.

## 2. Variables d'environnement

| Variable          | Rôle                                                                         | Exemple                       |
| ----------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| `AUTH_SECRET`     | Secret d'Auth.js et des clés de limitation, 32 caractères minimum            | —                             |
| `APP_URL`         | URL publique, pour construire les liens (sinon `AUTH_URL`, sinon la requête) | `https://binivol.exemple.org` |
| `AUTH_URL`        | URL publique de l'app, si elle ne peut pas être déduite de la requête        | `https://binivol.exemple.org` |
| `MAIL_DRIVER`     | `smtp` pour envoyer les liens par e-mail, `log` pour ne rien envoyer         | `smtp`                        |
| `AUTH_DEMO_LOGIN` | Connexion de démonstration (défaut `false`), **jamais sur Vercel**           | `false`                       |

`pnpm admin:grant` exige `APP_URL` ou `AUTH_URL` pour construire le lien. Les anciennes
variables `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` et `AUTH_ALLOWED_DOMAIN` ne sont plus lues : on
peut les retirer. Toutes ces variables sont validées au démarrage (`src/lib/env.ts`).

## 3. Premier compte TOPAZE

Personne ne peut se connecter tant qu'aucun compte n'existe. Le premier compte se crée en
ligne de commande, depuis une machine qui a accès à la base (`DIRECT_URL` ou `DATABASE_URL`) :

```bash
pnpm admin:grant prenom.nom@exemple.org TOPAZE --name "Prénom Nom" --username prenom.nom
```

- La commande crée le compte ou, s'il existe, lui donne **exactement** les profils indiqués et
  le réactive. Plusieurs profils sont possibles : `pnpm admin:grant x@exemple.org FORMAT DIAMANT`.
- Elle affiche un **lien d'accès à usage unique** : une invitation si le compte n'a pas encore de
  mot de passe, un lien de nouveau mot de passe sinon (récupération d'un TOPAZE qui a perdu le
  sien). Le lien n'est affiché que dans le terminal et n'est jamais envoyé par e-mail : ne le
  collez ni dans un ticket ni dans une conversation.
- `--username` fixe l'identifiant ; sans lui, la personne le choisit en ouvrant le lien.
- `pnpm admin:revoke prenom.nom@exemple.org` désactive un compte et ferme ses sessions.
- Chaque changement est journalisé avec le libellé « CLI ». Le dernier compte TOPAZE actif ne
  peut être ni désactivé ni privé de TOPAZE.

Sur le VPS (Docker), l'image finale ne contient ni `tsx` ni Prisma : la commande se lance dans
le service `migrate` (image `builder`), depuis `/opt/apps/binivol`, en lui passant l'URL publique
si ce service ne la reçoit pas déjà :

```bash
docker compose run --rm -e APP_URL=https://<domaine> migrate pnpm admin:grant prenom.nom@exemple.org TOPAZE --name "Prénom Nom"
```

## 4. Connexion de démonstration

Pour le développement et les tests e2e, `AUTH_DEMO_LOGIN=true` affiche sous le formulaire la
liste des comptes `@binivol.test` du seed, avec le bandeau « Mode démonstration ». Elle crée
une vraie session en base, avec les mêmes contrôles qu'une connexion par mot de passe (compte
actif, au moins un profil) et le même journal.

**Elle est interdite sur Vercel** : si `AUTH_DEMO_LOGIN=true` alors que `VERCEL_ENV` est défini
(production, prévisualisation ou développement Vercel), la validation de l'environnement
échoue et le serveur refuse de démarrer. Raison : n'importe qui pourrait se connecter en TOPAZE
sur une URL publique, et accéder à des données C3. Elle n'accepte de toute façon que des
adresses `@binivol.test`, qui n'existent pas en production.

Comme la connexion par mot de passe, elle crée la session par `src/server/auth/session.ts`.

## Démo hébergée (test uniquement, ADR-035)

Pour un déploiement Vercel **de test** à données fictives : `AUTH_DEMO_LOGIN=true`
et `AUTH_DEMO_ON_VERCEL=true`. La page `/connexion` propose alors les comptes `@binivol.test`,
l'import de classeur est refusé, et la base ne doit contenir que le seed de démonstration.
Jamais sur la base de production.
