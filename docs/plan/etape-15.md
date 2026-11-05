## Étape 15 — Recette, audit et guides (sans VPS)

### 0. Périmètre

La migration vers un VPS (Docker de production, cron système, sauvegardes hors serveur) est
**hors périmètre**. Cette étape rend la V1 **présentable et sûre** sur la démo Vercel +
Supabase.

### Objectif

#### 1. Parcours e2e complets (Playwright, `tests/e2e/parcours/`)

- **Candidat jusqu'au NIVOL** : premier contact par DIAMANT → rencontre → confirmation →
  lien envoyé → dossier rempli sur mobile → signé → contresigné → fiche Gaia → NIVOL saisi →
  bénévole actif dans l'annuaire, avec son point de suivi à 3 mois.
- **Mineur** : même parcours avec le représentant légal.
- **Vie du bénévole** : formation de groupe → compétence valide → Trouver → nomination →
  point de suivi → pause → reprise → départ.
- **Droits par profil** : pour chacun des 6 profils, et un compte cumulant deux profils, ce
  qu'il voit et ce qui lui est refusé (403 ou 404 selon la règle), sur les pages principales.

#### 2. Audit d'accessibilité

- axe sur **toutes** les pages (liste générée depuis `src/app`), en desktop et à 390 px ;
- navigation au clavier sur les parcours principaux ; ordre de focus ; libellés des
  formulaires ; `prefers-reduced-motion` ;
- rapport `docs/audit-accessibilite.md` : ce qui a été testé, ce qui a été corrigé, les
  limites connues.

#### 3. Audit de sécurité

Passe en revue et corrige, puis écris `docs/audit-securite.md` :

- en-têtes HTTP : CSP stricte (nonce si nécessaire), `frame-ancestors 'none'`,
  `Referrer-Policy: no-referrer` sur `/dossier`, HSTS, `X-Content-Type-Options`,
  `Permissions-Policy` ;
- **limitation de débit** des actions publiques (ouverture de lien, code de signature,
  connexion) en base, portable, sans service externe ;
- toutes les actions serveur passent par `defineAction` ou la liste fermée publique (test
  existant) ; toutes les pages appellent `requirePageAccess` (ajoute un test d'architecture
  s'il manque) ;
- aucune donnée sensible dans le rendu initial (test sur quelques pages) ;
- injection CSV (étape 13), téléchargement de fichiers (type, `Content-Disposition`), IDOR sur
  les routes de fichiers et d'export ;
- `pnpm audit` : corrige ou documente chaque vulnérabilité haute ou critique ;
- secrets : aucun dans le dépôt (cherche les motifs de clés), `.env.example` complet.

#### 4. Guides

- `docs/guides/` : **un guide par profil** (TOPAZE, ACTION, LASER, FORMAT, FORMAT GP,
  DIAMANT), en français simple, avec captures : se connecter, les tâches courantes pas à pas,
  qui contacter. Plus `docs/guides/candidat.md` (ce que vit un candidat).
- Une page `/aide` dans l'app qui affiche le guide des profils de l'utilisateur.
- `docs/mise-en-service.md` : la **liste de contrôle avant de mettre de vraies données** :
  accord du DPO ou de la DT, équipe Vercel de l'UL (pas une équipe d'entreprise), S3 et SMTP
  configurés, `CRON_SECRET`, comptes responsables créés, import du classeur réel
  (`AUTH_DEMO_ON_VERCEL` retiré), sauvegarde vérifiée. Chaque point dit **qui** le fait et
  **où**.

#### 5. Finitions

- Supprime toute page d'attente « Arrive à l'étape N » restante (ou dis pourquoi elle reste).
- Messages d'erreur et états vides relus (français, ton, accessibles).
- `README.md` à jour : ce que fait l'app, comment la lancer, où sont les docs.

### Tests attendus

Les parcours ci-dessus verts ; `pnpm verify`, `pnpm test:db`, `pnpm test:e2e` verts ; CI verte.

### Récapitulatif

Écris `docs/nuit/recap.md` comme décrit dans `docs/plan/marathon.md`, section 7.
