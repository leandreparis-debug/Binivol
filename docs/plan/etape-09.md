## Étape 9 — Assistant Gaia et passage au statut bénévole

### 0. Corrections préalables

1. Vérifie que l'étape 8 est `terminée` dans `docs/nuit/journal.md`. Si elle est `partielle`,
   fais d'abord ce qui manque **pour que la candidature puisse atteindre `GAIA`** ; le reste
   attendra.
2. **Pas de copie de diplôme stockée** (règle de l'ancien outil, Pegass fait foi pour les
   diplômes ; minimisation RGPD) :
   - retire `DIPLOMA_COPY` de `DOSSIER_ATTACHMENT_KINDS` (`src/lib/dossierForms.ts`), du
     formulaire, de la revue et de l'aide à l'écran ;
   - garde la valeur dans l'enum Prisma (des lignes peuvent exister) mais refuse tout
     nouveau dépôt de ce type, côté dossier et côté onglet Documents ;
   - le formulaire dit à la place : « Tes diplômes seront vérifiés dans Pegass, tu n'as pas
     à les envoyer » ;
   - ADR + `docs/dossier.md` + tests. Note-le dans `docs/nuit/questions.md` (réversible).

### Contexte

Une fois la charte contresignée (étape 8), la candidature est à l'étape `GAIA`. Un
responsable doit créer la personne **à la main** dans Gaia, l'outil national de la
Croix-Rouge, qui lui attribue un **NIVOL** (11 chiffres + 1 lettre) et une adresse
`@croix-rouge.fr`. Binivol **n'appelle jamais Gaia** : il assiste la saisie, puis
enregistre le résultat.

### Objectif

1. **Fiche Gaia pré-remplie** (onglet Intégration, bloc « Gaia ») pour `dossier.manage` :
   - un champ par ligne, dans l'ordre de l'écran de création de Gaia (civilité, nom de
     naissance, nom d'usage, prénom, date et lieu de naissance, nationalité, adresse,
     téléphone, e-mail, contact d'urgence) ;
   - un bouton « Copier » par champ, plus « Tout copier » (texte tabulé) ;
   - les valeurs sensibles ne s'affichent qu'à la demande, par `readPersonSensitive`
     (journalisé, contexte « gaia »), jamais dans le rendu initial ;
   - les dates en `JJ/MM/AAAA`.
2. **Checklist** cochable, enregistrée et datée (qui, quand) :
   - « Personne créée dans Gaia » ;
   - « Adhésion enregistrée » (si l'adhésion a été demandée dans le dossier) ;
   - « Rattachement à l'UL de Versailles » ;
   - « Compte @croix-rouge.fr demandé ».
     La liste est un paramètre `Setting` (`GAIA_CHECKLIST`), modifiable plus tard.
3. **Saisie du résultat** :
   - NIVOL via `normalizeNivol()` : format refusé avec un message clair, **doublon refusé**
     avec le nom de la personne qui l'a déjà (si l'acteur peut la voir ; sinon « déjà
     attribué ») ;
   - e-mail CRF : doit finir par `@croix-rouge.fr`, unique parmi les personnes présentes ;
   - date d'entrée (par défaut : aujourd'hui, jour de Paris).
4. **Clôture**, en une transaction :
   - `Person.nivol`, `crfEmail`, `entryDate` ; `status` `CANDIDATE` → `ACTIVE` ;
   - candidature `GAIA` → `DONE` par la machine (`CandidacyEvent`) ;
   - si un parrain est attribué, son parrainage reste ouvert ;
   - un point de suivi « 3 mois » est planifié (`FollowUp`, `THREE_MONTHS`,
     `scheduledAt = entryDate + 3 mois`) ;
   - `withAudit`.
5. **Attestation d'aptitude complétée** : après la clôture, Binivol régénère l'attestation
   avec le NIVOL (nouvelle version, l'ancienne archivée, jamais effacée ; empreinte ajoutée
   à la preuve). Si le stockage manque (démo hébergée), la clôture réussit quand même et un
   message dit que l'attestation sera complétée plus tard ; un bouton « Compléter
   l'attestation » permet de réessayer.
6. **Retour arrière** : TOPAZE peut annuler une clôture faite par erreur dans les 7 jours
   (motif obligatoire) : NIVOL et e-mail CRF effacés de la fiche, statut `CANDIDATE`,
   candidature rouverte en `GAIA`, tout tracé.
7. **Raccourci depuis la liste des candidats** : les candidats en `GAIA` ont une étiquette
   « À créer dans Gaia » et un filtre dédié.

### Règles

- Le NIVOL et l'e-mail CRF **déclarés** par le candidat dans son dossier ne sont **jamais**
  reportés automatiquement (règle de l'étape 7) : la saisie se fait ici, par un responsable.
- Toute action passe par `defineAction` et la politique (`candidacy.manage` ou
  `dossier.manage`, selon la matrice ; ajoute une permission si besoin, `docs/permissions.md`
  régénéré).
- Contrôle de concurrence : deux clôtures simultanées, la seconde est refusée.

### Seed

- Un candidat en `GAIA` avec checklist vide, un autre avec checklist à moitié cochée.
- Un bénévole récemment clôturé (avec son point de suivi à 3 mois planifié).

### Tests attendus

- Vitest : format et normalisation NIVOL, e-mail CRF, ordre et contenu du texte « Tout
  copier », calcul de la date du suivi à 3 mois au fuseau de Paris.
- `test:db` : clôture complète (statut, candidature, événement, suivi, audit) ; doublon NIVOL
  et e-mail ; concurrence ; retour arrière par TOPAZE et refus après 7 jours ; régénération de
  l'attestation avec le NIVOL (relue avec `pdf-lib`) ; refus de `DIPLOMA_COPY`.
- Playwright : un responsable DIAMANT copie la fiche, coche la checklist, saisit le NIVOL et
  voit la personne passer dans l'annuaire en « Actif » ; axe sans violation.

### Documentation

- `docs/integration.md` : le bloc Gaia, la checklist, la clôture et le retour arrière.
- ADR : pas d'appel à Gaia, attestation régénérée avec le NIVOL, pas de copie de diplôme.

### Récapitulatif (dans le journal)

Migrations, tests, écarts, captures (fiche Gaia, saisie du NIVOL).
