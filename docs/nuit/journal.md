# Journal de nuit — marathon V1 (étapes 8 à 15)

> **Branche de travail** : `claude/binivol-v1-marathon-nuit-7yijue` (la session impose cette
> branche ; `marathon.md` cite `claude/quirky-johnson-9av6kd`, d'une session précédente).
> `main` est avancé en fast-forward depuis cette branche.

## Démarrage (05/11/2026)

- `main` (`78add07`) était un ancêtre direct de la branche : avancé en fast-forward à
  `803c137` et poussé.
- Environnement : PostgreSQL 16 local (bases `binivol`, `binivol_test`, `binivol_e2e`),
  Chromium Playwright préinstallé.
- Suites de référence, avant tout changement : `pnpm verify` 664 tests unitaires verts ;
  `pnpm test:db` 233 verts ; `pnpm test:e2e` 86 verts, 34 ignorés (ignorés par projet dans les
  specs existantes, hors de cette nuit).
- CI GitHub et déploiement Vercel : consultables par les outils MCP, vérifiés en fin d'étape
  quand c'est possible.

| #   | Étape                                              | Statut   |
| --- | -------------------------------------------------- | -------- |
| 8   | Signature électronique et PDF officiels            | terminée |
| 9   | Assistant Gaia et passage au statut bénévole       | à faire  |
| 10  | Formations, compétences et nominations             | à faire  |
| 11  | Points de suivi, parrainage, B3, pauses et départs | à faire  |
| 12  | Alertes, rappels et e-mails automatiques           | à faire  |
| 13  | Tableaux de bord, matrice et exports               | à faire  |
| 14  | RGPD et administration                             | à faire  |
| 15  | Recette, audit et guides (sans VPS)                | à faire  |

## Étape 8 — terminée

**Commits** : `327d40d` (seed démo hébergée), `38daadf` (jeton après `#`), `3ecff1a` + `fee601a`
(e-mail du représentant légal, schéma v2), `9cdc280` (migration), `cd4d79e` (PDF et code),
`1dc9cbd` (correctif du test instable), `7fdb609` (seed), `9f8cdff` (signature), puis les commits de
correctifs e2e et de documentation de fin d'étape.

**Migration** : `20261107090000_signature_and_documents` (méthode et saisie de la signature,
e-mail vérifié et vérificateur, unicité (dossier, rôle), état de l'e-mail du dossier,
`documents.submission_id`, `outbound_mails.attachments`, rôle du défi de code, CHECK
`signatures_in_person_verifier`).

**Résultats** : `pnpm verify` 712 tests unitaires verts ; `pnpm test:db` 245 verts (dont 10 du
parcours de signature) ; `pnpm test:e2e` 86 verts, 34 ignorés (ignorés par projet, comme avant
l'étape). `pnpm db:fresh` passe.

### Récapitulatif demandé (cahier de l'étape 8)

- **`main`** : avancé en fast-forward au démarrage (`78add07` → `803c137`), puis à la fin de
  l'étape. Production : voir la section « Déploiement » ci-dessous.
- **Migrations** : `20261107090000_signature_and_documents`.
- **Lecture de la charte** (`docs/captures/pdf-champs-charte.png`, `docs/dossier.md`) :
  `Nom`/`Prénom` = bénévole ; `Nom_2`/`Prénom_2`/`Qualité`/`Structure 1-2` = représentant CRF ;
  `Nom_3`/`Prénom_3` = représentant légal (bloc mineur) ; `nom / qualité` +
  `numéro de téléphone` = **personne à prévenir** ; `Signature` = bénévole, `Signature 01` =
  représentant CRF, `Signature parent` = représentant légal ; `Fait à` + `Jour/Mois/Année` = lieu
  et date de signature du bénévole.
- **Test instable (0.4)** : `src/server/dossier/__tests__/token.test.ts`, « refuses a tampered
  or malformed cookie ». Trouvé à la 20e relance sur 30 (ordre aléatoire). Cause : **la date du
  jour** — la signature HMAC du cookie dépend de `Date.now()`, et la falsification remplaçait
  son premier caractère par « x » ; quand il valait déjà « x » (1 fois sur 64), le cookie restait
  valide. Corrigé : instant fixe et caractère garanti différent.
- **`git ls-files docs/ assets/`** : voir la fin de cette section.
- **Captures** : `docs/captures/signature-{documents,trace,nom,code,confirmation}-390.png`,
  `signature-bloc-1440.png`, `contresignature-1440.png`, `signature-complet-1440.png`,
  `signature-documents-1440.png`, `pdf-champs-{charte,attestation,dossier-p2}.png`,
  `pdf-final-{dossier,charte,attestation}.png` (PDF générés depuis des données fictives du seed :
  les documents du seed sont `fileMissing`).
- **Tests e2e ignorés** : aucun nouveau. Les 34 ignorés le sont par projet (`test.skip` selon
  bureau/mobile), inchangés.

### Écarts au cahier, justifiés

- **Branche** : la session impose `claude/binivol-v1-marathon-nuit-7yijue` (le cahier cite
  `claude/quirky-johnson-9av6kd`, d'une session précédente).
- **Nom de fichier téléchargé** : vérifié par l'en-tête `Content-Disposition` (`filename*`,
  RFC 5987) dans l'e2e, car le Chromium sans interface de l'environnement ne décode pas un
  `filename*` non ASCII (il propose « download », même pour un en-tête minimal) ; le
  téléchargement lui-même est vérifié.
- **Après l'envoi**, la page passe directement aux écrans de signature (le cookie renouvelé
  rafraîchit la page) ; l'écran « Votre dossier a bien été envoyé » n'est plus qu'un état
  transitoire.
- **Passage à GAIA** dans la transaction de la contresignature, avant l'e-mail (ADR-046) : le
  cahier liste l'e-mail en 4 et GAIA en 5, mais un échec de l'e-mail ne doit pas bloquer un
  dossier complet.
- **`seed:base`** ne réécrit plus les paramètres existants (sinon le texte de l'e-mail, prévu
  « modifiable plus tard », aurait été écrasé à chaque déploiement).
- **Délai de 60 s** par signataire (voir `docs/nuit/questions.md`, point 8).
- **Démo hébergée** : sans S3, la signature est refusée dès l'écran (message clair), pas
  seulement la contresignature.
- **Vérification de fin d'étape 1-2** (parcours à la main, `sha256sum`) : faite par les tests
  (`signature.db.test.ts` relit les PDF stockés, vérifie l'aplatissement, les empreintes de la
  preuve et des pièces jointes) et par les captures du parcours réel en local.
