# Connexion et comptes

Seuls les responsables de l'unité locale se connectent, avec leur compte Google
**@croix-rouge.fr**. Les bénévoles et les candidats n'ont jamais de compte. Un responsable ne
peut se connecter que si TOPAZE l'a ajouté, que son compte est actif et qu'il a au moins un
profil. Les règles d'accès sont décrites dans `docs/permissions.md`.

## Fonctionnement

- **Auth.js** (`next-auth` 5.0.0-beta.32, épinglée), fournisseur Google uniquement.
- **Sessions en base** (table `sessions`) : 12 h, renouvelées après chaque heure d'activité.
  Désactiver un compte supprime ses sessions : la coupure est immédiate.
- Cookie de session `HttpOnly`, `SameSite=Lax`, `Secure` et préfixé `__Secure-` en HTTPS.
- La session ne contient que l'identifiant, le nom et l'e-mail. **Les profils sont relus en
  base à chaque requête** : un profil retiré ou un compte désactivé prend effet tout de suite.
- À chaque connexion Google, Binivol vérifie lui-même, dans l'ordre : adresse vérifiée par
  Google, domaine `AUTH_ALLOWED_DOMAIN`, compte existant, compte actif avec au moins un profil.
  Le paramètre `hd` envoyé à Google n'est qu'une indication. Un compte inconnu est refusé,
  **jamais créé**.
- Journal d'audit : `LOGIN`, `LOGIN_DENIED` (adresse et motif, jamais de jeton) et `LOGOUT`.
- Aucun jeton Google n'est conservé : la table `accounts` ne garde que l'identifiant Google.

## 1. Créer le client OAuth Google

1. Dans la [console Google Cloud](https://console.cloud.google.com/), créer (ou choisir) un
   projet rattaché à l'organisation Croix-Rouge si possible.
2. **Écran de consentement OAuth** : type **Interne** si le projet appartient à
   l'organisation Google Workspace de la Croix-Rouge (seuls ses comptes peuvent alors se
   connecter). Sinon, type Externe en mode test, avec la liste des responsables comme
   testeurs. Portées : `openid`, `email`, `profile` uniquement.
3. **Identifiants → Créer des identifiants → ID client OAuth → Application Web**.
4. **URI de redirection autorisés** :
   - local : `http://localhost:3000/api/auth/callback/google` ;
   - Vercel : `https://<domaine-de-production>/api/auth/callback/google` ;
   - VPS : `https://<domaine>/api/auth/callback/google`.
5. Copier l'ID client et le secret dans `AUTH_GOOGLE_ID` et `AUTH_GOOGLE_SECRET`.

## 2. Variables d'environnement

| Variable              | Rôle                                                                  | Exemple                       |
| --------------------- | --------------------------------------------------------------------- | ----------------------------- |
| `AUTH_SECRET`         | Secret d'Auth.js, 32 caractères minimum (`openssl rand -base64 32`)   | —                             |
| `AUTH_URL`            | URL publique de l'app, si elle ne peut pas être déduite de la requête | `https://binivol.exemple.org` |
| `AUTH_GOOGLE_ID`      | ID client OAuth                                                       | `…apps.googleusercontent.com` |
| `AUTH_GOOGLE_SECRET`  | Secret client OAuth                                                   | —                             |
| `AUTH_ALLOWED_DOMAIN` | Domaine autorisé (défaut `croix-rouge.fr`)                            | `croix-rouge.fr`              |
| `AUTH_DEMO_LOGIN`     | Connexion de démonstration (défaut `false`), **jamais sur Vercel**    | `false`                       |

Sans `AUTH_GOOGLE_ID`, le bouton Google est affiché désactivé. Toutes ces variables sont
validées au démarrage (`src/lib/env.ts`) : une valeur invalide empêche le serveur de démarrer.

## 3. Premier compte TOPAZE

Personne ne peut se connecter tant qu'aucun compte n'existe. Le premier compte se crée en
ligne de commande, depuis une machine qui a accès à la base (`DIRECT_URL` ou `DATABASE_URL`) :

```bash
pnpm admin:grant prenom.nom@croix-rouge.fr TOPAZE --name "Prénom Nom"
```

- La commande crée le compte ou, s'il existe, lui donne **exactement** les profils indiqués et
  le réactive. Plusieurs profils sont possibles : `pnpm admin:grant x@croix-rouge.fr FORMAT DIAMANT`.
- `pnpm admin:revoke prenom.nom@croix-rouge.fr` désactive un compte et ferme ses sessions.
- Chaque changement est journalisé avec le libellé « CLI ».
- Les adresses hors de `AUTH_ALLOWED_DOMAIN` sont refusées (sauf `@binivol.test` quand la
  connexion démo est active). Le dernier compte TOPAZE actif ne peut être ni désactivé ni
  privé de TOPAZE.

Ensuite, TOPAZE gère les comptes depuis l'app : menu du compte → **Gérer les comptes**
(`/admin/comptes`).

## 4. Déploiements de prévisualisation Vercel

Google n'accepte que des URI de redirection fixes, pas les domaines variables des
prévisualisations (`binivol-git-xxx.vercel.app`). Deux possibilités :

- utiliser un **alias fixe** pour la prévisualisation (par exemple
  `binivol-preview.vercel.app`, attribué à la branche de test) et le déclarer chez Google ;
- ou utiliser le **proxy de redirection d'Auth.js** : déclarer chez Google l'URI de
  production seulement, et définir sur les prévisualisations
  `AUTH_REDIRECT_PROXY_URL=https://<domaine-de-production>/api/auth`, avec le même
  `AUTH_SECRET` que la production.

## 5. Connexion de démonstration

Pour le développement et les tests e2e, `AUTH_DEMO_LOGIN=true` affiche sous le bouton Google
la liste des comptes `@binivol.test` du seed, avec le bandeau « Mode démonstration ». Elle crée
une vraie session en base, avec les mêmes contrôles qu'une connexion Google (compte actif, au
moins un profil) et le même journal.

**Elle est interdite sur Vercel** : si `AUTH_DEMO_LOGIN=true` alors que `VERCEL_ENV` est défini
(production, prévisualisation ou développement Vercel), la validation de l'environnement
échoue et le serveur refuse de démarrer. Raison : n'importe qui pourrait se connecter en TOPAZE
sur une URL publique, et accéder à des données C3. Elle n'accepte de toute façon que des
adresses `@binivol.test`, qui n'existent pas en production.

Elle ne passe pas par un fournisseur Auth.js : les fournisseurs « identifiants » d'Auth.js ne
fonctionnent pas avec les sessions en base. Elle crée donc la session et le cookie elle-même
(`src/server/auth/demo.ts`), avec le même nom, la même durée et les mêmes options.

## Démo hébergée (test uniquement, ADR-035)

Pour un déploiement Vercel **de test** à données fictives, sans Google : `AUTH_DEMO_LOGIN=true`
et `AUTH_DEMO_ON_VERCEL=true`. La page `/connexion` propose alors les comptes `@binivol.test`,
l'import de classeur est refusé, et la base ne doit contenir que le seed de démonstration.
Jamais sur la base de production.
