## Étape 14 — RGPD et administration

### 0. Corrections préalables

Dépend de l'étape 12 (la purge s'exécute dans la tâche quotidienne). Les journaux sont en
ajout seul, garantis par un déclencheur ; la purge passe par `binivol.allow_purge` (voir la
migration et `docs/decisions.md`).

### Objectif

#### 1. Purge automatique

- **Bénévoles partis** : `purgeEligibleAt` passé (départ + `RETENTION_YEARS`, 5 ans par
  défaut).
- **Candidatures abandonnées** (remplace la suppression de prospect de l'ancien outil) :
  candidat jamais devenu bénévole, candidature `ABANDONED` depuis plus de
  `ABANDONED_RETENTION_MONTHS` (12 par défaut).
- Fonctionnement :
  - la tâche quotidienne **ne purge pas seule** la première fois : elle liste les fiches
    éligibles dans une alerte TOPAZE ; TOPAZE valide la purge depuis `/admin/purge` (liste,
    tout cocher, confirmation en tapant « PURGER ») ;
  - un réglage `PURGE_MODE` (`MANUAL` par défaut, `AUTOMATIC`) permet plus tard de purger sans
    validation ;
  - la purge **supprime physiquement** la personne et tout ce qui en dépend (fichiers du
    stockage compris), c'est la seule suppression physique autorisée ;
  - dans les journaux, les lignes qui la concernent sont **anonymisées** (identifiants
    remplacés par un pseudonyme, valeurs effacées), pas supprimées ;
  - une trace minimale reste : « 1 fiche purgée le JJ/MM/AAAA par X, règle Y », sans donnée
    personnelle ;
  - un fichier du stockage qui ne se supprime pas : la purge continue, et l'échec est listé
    pour une nouvelle tentative.
- Teste que rien ne reste de la personne en base (requête sur toutes les tables qui ont un
  `personId`) et que les journaux restent cohérents.

#### 2. Droits des personnes (RGPD)

- **Export des données d'une personne** (droit d'accès et portabilité), TOPAZE seul :
  - une archive ZIP : `donnees.json` (toutes les données, sensibles comprises, structurées et
    commentées), un `resume.pdf` lisible en français, et ses documents stockés ;
  - la génération est journalisée (`AccessLog`, contexte « export RGPD ») ;
  - sans stockage (démo), l'archive contient le JSON et le PDF, et liste les fichiers absents.
- **Rectification** : déjà possible par la fiche ; rien à ajouter.
- **Opposition et effacement** : documente la procédure dans `docs/rgpd.md` (qui décide, la
  purge anticipée par TOPAZE avec motif, ce qui doit rester pour obligation légale).

#### 3. Journaux (`/admin/journaux`, TOPAZE)

- Journal d'audit : filtres (période, auteur, type d'objet, personne, action), valeurs
  sensibles masquées comme à l'écriture, pagination côté serveur.
- Journal des consultations sensibles : qui a consulté quoi, quand, dans quel contexte ; un
  filtre « consultations par une même personne sur 24 h » pour repérer les abus.
- Export CSV des journaux (journalisé lui aussi).

#### 4. Paramètres de l'UL (`/admin/parametres`, TOPAZE)

Regroupe proprement tous les `Setting` des étapes précédentes, par thème : identité de l'UL
(`UL_NAME`, `UL_CITY`, adresse de l'équipe), délais (alerte, nouveaux, rétention, purge),
e-mails (textes, fréquence), référentiel (lien vers l'édition), Gaia (checklist). Chaque
réglage : libellé clair, aide, valeur par défaut, validation Zod, `withAudit`.

#### 5. Sauvegarde (version sans VPS)

- Script `pnpm db:backup` : `pg_dump` au format custom, **chiffré** (AES-256-GCM ou `age`,
  clé lue dans l'environnement, jamais en dur), nom daté, rotation des `BACKUP_KEEP` dernières
  copies (8 par défaut) dans un dossier local. Et `pnpm db:restore` sur une base **locale**
  seulement (refus si l'URL n'est pas locale).
- `docs/sauvegarde.md` : ce que fait Supabase aujourd'hui selon son offre (à vérifier par
  Léandre), comment lancer une sauvegarde à la main, et ce que l'étape VPS automatisera.
- Pas d'automatisation sur Vercel cette nuit.

#### 6. Information des personnes

- Rédige `docs/rgpd.md` : registre de traitement (finalités, base légale, catégories de
  données, destinataires, durées, mesures de sécurité), en brouillon **à faire valider par le
  DPO** (dis-le en tête).
- Une page publique `/confidentialite` (texte dans un `Setting`, brouillon marqué comme tel),
  liée depuis le dossier en ligne.

### Tests attendus

- Vitest : calcul d'éligibilité, anonymisation, contenu de l'export, CSV.
- `test:db` : purge complète d'un parti et d'un candidat abandonné (plus rien en base,
  journaux anonymisés, trace minimale) ; mode manuel : rien ne part sans validation ; échec du
  stockage ; export RGPD journalisé ; filtres des journaux ; refus pour un non-TOPAZE.
- Playwright : TOPAZE purge une fiche fictive éligible ; exporte une personne ; consulte les
  journaux ; axe sans violation.

### Documentation

`docs/rgpd.md`, `docs/sauvegarde.md`, `docs/permissions.md`, ADR (purge validée à la main par
défaut, anonymisation des journaux), captures.

### Récapitulatif (dans le journal)

Migrations, tests, écarts, captures.
