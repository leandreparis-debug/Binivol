# Dossier bénévole en ligne (étape 7)

Le candidat remplit son dossier sur son téléphone, sans compte, depuis un lien sécurisé. DIAMANT
le relit, puis reporte dans la fiche les champs choisis. La signature (étape 8) et Gaia (étape 9)
ne sont pas traitées ici.

## Parcours

1. **Lien.** Depuis l'onglet Intégration de la fiche (bloc « Dossier »), DIAMANT crée un lien
   (7 jours par défaut, paramètre `DOSSIER_LINK_DAYS`, de 1 à 30). Le lien s'affiche **une
   seule fois** : « Copier le lien » ou « Envoyer par e-mail » (`MailService`, `docs/mail.md`).
   Une candidature à l'étape « Engagement confirmé » passe à « Dossier » par la machine
   (`changeStage`, `CandidacyEvent` dans la même transaction).
2. **Saisie.** Le candidat ouvre le lien et remplit les étapes. Chaque modification est
   enregistrée une seconde après la frappe, et à chaque changement d'étape. Il peut s'arrêter et
   reprendre avec le même lien : « Reprendre » mène à la première étape incomplète.
3. **Envoi.** À la relecture, le candidat coche la case d'information sur ses données
   (`RGPD_NOTICE`) et envoie. Le dossier passe à `SUBMITTED` ; les pièces jointes deviennent des
   `Document` de la personne ; le lien est marqué utilisé (`usedAt`).
4. **Revue et report.** DIAMANT ouvre « Voir le dossier » (`/benevoles/[ref]/dossier`), affiche
   la comparaison à la demande (consultation journalisée), coche les champs et clique
   « Reporter dans la fiche ».

**Mode sur place** (`/benevoles/[ref]/dossier/sur-place`) : « Remplir sur place » ouvre le
même formulaire sur l'appareil du responsable, hors de la coquille de l'application (pas de
navigation, bandeau « Mode sur place », bouton « Rendre l'appareil au responsable »). Il
s'appuie sur un lien `ON_SITE` dont le jeton est jeté aussitôt : il ne peut jamais s'ouvrir à
distance. Les actions passent par `defineAction` (`dossier.manage`) et l'audit porte le nom du
responsable suivi de « (sur place) ».

## Étapes du formulaire

| #   | Étape                     | Contenu                                                                                         |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | Accueil                   | Présentation, durée, pièces à préparer                                                          |
| 2   | Identité                  | Civilité, nom, nom de naissance, nom d'usage, prénom, second prénom, naissance                  |
| 3   | Coordonnées               | Adresse, pays, téléphones et e-mails personnels et professionnels                               |
| 4   | Croix-Rouge               | Déjà bénévole, NIVOL déclaré, e-mail Croix-Rouge déclaré, activités souhaitées (4 au plus)      |
| 5   | Personne à prévenir       | Une personne : civilité, nom, prénom, lien, adresse, téléphones, e-mail                         |
| 6   | Profil                    | Profession, secteur, entreprise ; 4 compétences, 3 langues (avec niveaux), 5 diplômes, 4 permis |
| 7   | Représentant légal        | **Mineurs seulement** : nom, prénom, qualité, téléphone                                         |
| 8   | Pièces jointes            | Copies de diplômes, autorisation parentale (mineurs), demande d'adhésion                        |
| 9   | Relecture et consentement | Résumé par étape (« Modifier »), points à compléter, information RGPD, envoi                    |
| —   | Confirmation              | « Votre dossier a bien été envoyé »                                                             |

Le B3 et le permis de conduire ne sont **jamais** demandés : le profil ne demande que les
catégories de permis, et l'étape Pièces jointes le rappelle.

## Données et validation

- `src/lib/dossierSchema.ts` (partagé client et serveur) :
  - `dossierDraftSchema` : brouillon, tout facultatif, seulement les types et les longueurs ;
  - `submissionIssues()` : règles de l'envoi, chaque problème avec son étape ;
  - `DOSSIER_SCHEMA_VERSION` (1), enregistrée avec les données ; `migrateDossierData()` relit
    une ancienne version (la version 0 à champs plats est convertie ; une section illisible est
    ignorée avec un avertissement, sans casser le formulaire) ;
  - `normalizeSubmission()` : téléphones en chiffres, e-mails en minuscules, NIVOL normalisé,
    permis en majuscules.
- Règles de l'envoi : champs obligatoires ; téléphone (10 chiffres ou international) ; e-mail ;
  code postal à 5 chiffres en France ; département de naissance si né en France ; date de
  naissance ni future, ni au-delà de 100 ans ; NIVOL déclaré au format (11 chiffres et une
  lettre) ; e-mail Croix-Rouge en `@croix-rouge.fr` ; un niveau par compétence et par langue ;
  case RGPD cochée.
- Accès : les tables `dossier_submissions` et `dossier_attachments` ne sont lues et écrites que
  par `src/server/dossier/store.ts`, le second module sensible autorisé (avec
  `src/server/sensitive.ts`) par le test d'architecture.

## Mineurs

L'âge se calcule à la date d'envoi (Europe/Paris) :

- **moins de 18 ans** : l'étape « Représentant légal » apparaît ; nom, prénom, qualité et
  téléphone sont obligatoires ;
- **moins de 16 ans** : une pièce « Autorisation parentale » est aussi obligatoire.

Un envoi incomplet est refusé, avec le message à l'étape concernée.

## Sécurité du lien

- **Jeton** : 32 octets aléatoires en base64url (43 caractères). Seule son empreinte SHA-256
  est stockée (`dossier_links.token_hash`). Le jeton n'apparaît qu'une fois, dans la boîte de
  dialogue de création ; il n'est écrit dans aucune table (le courriel consigné par le pilote
  `log` est chiffré, AES-256-GCM).
- **Jeton après `#`** (ADR-043) : le lien envoyé est `/dossier/ouvrir#<jeton>`. Le fragment
  (après `#`) n'est jamais envoyé par le navigateur : le jeton n'apparaît dans aucune adresse
  reçue par le serveur, ni dans aucun journal d'accès (hébergeur, proxy). La page
  `/dossier/ouvrir` lit le fragment, l'efface aussitôt de l'adresse (`history.replaceState`),
  puis l'envoie dans le **corps** d'une requête `POST` à l'action publique d'échange
  (`openDossierLinkAction`).
- **Échange contre un cookie** (ADR-038) : l'action vérifie l'empreinte, pose le cookie
  `binivol_dossier` (`HttpOnly`, `SameSite=Lax`, chemin `/dossier`, `Secure` en HTTPS, 2 h
  glissantes, signé HMAC-SHA256 avec une clé dérivée d'`AUTH_SECRET`), puis la page affiche
  `/dossier`. Un test e2e vérifie qu'aucune adresse de requête ne contient le jeton et que seul
  le `POST` de l'échange le porte.
- **En-têtes** `/dossier*` (et le mode sur place) : `Referrer-Policy: no-referrer`,
  `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`.
- **Refus neutre** : jeton inconnu, expiré, révoqué ou utilisé → une seule page, « Ce lien
  n'est plus valable. Contactez l'unité locale. » La tentative est journalisée
  (`LOGIN_DENIED`, entité `DossierLink`, raison), **sans le jeton**.
- **Usage** (ADR-039) : le lien reste réutilisable pour reprendre le brouillon jusqu'à l'envoi,
  puis `usedAt` le ferme. Un nouveau lien révoque les précédents ; le brouillon déjà saisi est
  **rattaché au nouveau lien**.
- **Session expirée** : les actions répondent « Votre session a expiré… » ; ce qui est à l'écran
  reste affiché, et rouvrir le lien (s'il est valable) relance la session.
- **Actions publiques** : `src/app/(public)/dossier/actions.ts`, cinq actions par
  `definePublicAction` (échanger le jeton, enregistrer, ajouter et retirer une pièce, envoyer). Chacune relit le
  cookie et le lien ; la personne et le brouillon viennent du lien, jamais de l'entrée. La liste
  fermée du test d'architecture les nomme.
- **Journaux de la plateforme** : grâce au fragment, le jeton n'y figure jamais (ADR-043).

## Pièces jointes

Mêmes règles que les documents (`docs/storage.md`) : signature binaire PDF, JPEG ou PNG,
10 Mo au plus, clé aléatoire `dossiers/…`, pas d'URL publique. Avant l'envoi, elles sont dans
`dossier_attachments` ; à l'envoi, chacune devient un `Document` (exemplaire UL) de la
personne. Stockage indisponible : message clair, le brouillon est conservé.

## Revue et report (ADR-040)

- Tableau en trois colonnes : champ, fiche actuelle, dossier. « Différent » signale un écart
  (comparaison sans casse, accents ni espaces).
- Une case par champ différent ; elle est **cochée par défaut quand la fiche est vide**.
- « Reporter dans la fiche » écrit, **en une transaction auditée** : `Person`,
  `PersonSensitive`, la première `EmergencyContact`, et les listes (compétences, langues,
  permis, diplômes déclarés, activités souhaitées : ajouts seulement, rien n'est retiré).
- Le **NIVOL** et l'**e-mail Croix-Rouge** déclarés ne sont **jamais** reportés : ils sont
  affichés « Pour information » (étape 9). Un NIVOL déclaré déjà présent dans Binivol est
  signalé (« Ce NIVOL est déjà attribué à… »).
- La comparaison ne figure pas dans le rendu initial : elle se charge par une action
  (`readDossierReviewAction`) qui écrit un `AccessLog` `SENSITIVE_VIEW`, contexte « dossier ».

## Correspondance avec les PDF (pour l'étape 8)

Les cases à cocher valent `/Oui` ou `/Off`. Les dates se découpent en jour, mois, année.

### Dossier-Bénévole (89 champs ; 85 viennent du dossier, 4 de la signature)

| Champ(s) AcroForm                                                  | Donnée du dossier                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `Nom`, `Prénom`, `Prénom - 2`                                      | `identity.lastName`, `identity.firstName`, `identity.secondFirstName`               |
| `Nom d'usage`, `Nom de naissance`                                  | `identity.usageName`, `identity.birthName`                                          |
| `Civilité - Mme`, `Civilité - M`                                   | `identity.civility` (`MME` / `M`)                                                   |
| `Jour naissance`, `Mois naissance`, `Année naissance`              | `identity.birthDate` (AAAA-MM-JJ)                                                   |
| `Ville naissance`, `Département naissance`, `Pays naissance`       | `identity.birthCity`, `identity.birthDepartment`, `identity.birthCountry`           |
| `Numéro et voie résidence`, `Complément adresse résidence`         | `contact.street`, `contact.addressComplement`                                       |
| `Code postal et ville résidence`, `Pays résidence`                 | `contact.postalCode` + `contact.city`, `contact.country`                            |
| `Téléphone personnel`, `Email personnel`                           | `contact.phone`, `contact.email`                                                    |
| `Téléphone professionnel`, `Email professionnel`                   | `contact.proPhone`, `contact.proEmail`                                              |
| `Structure de rattachement`                                        | `structure` (paramètre `UL_NAME`, écrit à l'envoi)                                  |
| `Déjà bénévole - OUI`, `Déjà bénévole - NON`                       | `crf.alreadyVolunteer`                                                              |
| `NIVOL - Oui`, `NIVOL - Non`, `NIVOL`                              | `crf.hasNivol`, `crf.nivol` (déclaré)                                               |
| `Mail CRf - OUI`, `Mail CRf - NON`, `Mail CRf`                     | `crf.hasCrfEmail`, `crf.crfEmail` (déclaré)                                         |
| `Civilité urgence - Mme`, `Civilité urgence - M`                   | `emergency.civility`                                                                |
| `Nom urgence`, `Prénom urgence`, `Lien de parenté urgence`         | `emergency.lastName`, `emergency.firstName`, `emergency.relationship`               |
| `Adresse urgence`, `Code Postal et ville urgence`, `Pays urgence`  | `emergency.address`, `emergency.postalCode` + `emergency.city`, `emergency.country` |
| `Email urgence`, `Téléphone 1 urgence`, `Téléphone 2 urgence`      | `emergency.email`, `emergency.phone1`, `emergency.phone2`                           |
| `Activité 1` à `Activité 4`                                        | `crf.activities[0..3]`                                                              |
| `Compétence 1` à `Compétence 4`                                    | `profile.skills[i].label`                                                           |
| `Compétence n - Débutant` / `- Confirmé` / `- Expert` (12 cases)   | `profile.skills[i].level` (`BEGINNER`, `CONFIRMED`, `EXPERT`)                       |
| `Profession`, `Secteur professionnel`, `Entreprise`                | `profile.profession`, `profile.sector`, `profile.company`                           |
| `Langue 1` à `Langue 3`                                            | `profile.languages[i].label`                                                        |
| `Langue n - Notions` / `- Courant` / `- Bilingue` (9 cases)        | `profile.languages[i].level` (`NOTIONS`, `FLUENT`, `BILINGUAL`)                     |
| `Diplome 1` à `Diplome 5`                                          | `profile.diplomas[0..4]`                                                            |
| `Permis 1` à `Permis 4`                                            | `profile.licenses[0..3]` (catégories)                                               |
| `Jour signature`, `Mois signature`, `Année signature`, `Signature` | étape 8 (signature)                                                                 |

### Charte-du-Bénévolat (18 champs ; 7 viennent du dossier)

| Champ(s) AcroForm                                            | Donnée                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `Nom`, `Prénom`                                              | `identity.lastName`, `identity.firstName` (bénévole)                                        |
| `Nom_2`, `Prénom_2`                                          | **à confirmer** sur le PDF (étape 8) : bénévole, représentant CRF ou parent                 |
| `Nom_3`, `Prénom_3`                                          | **à confirmer** sur le PDF (étape 8) : bénévole, représentant CRF ou parent                 |
| `Qualité`                                                    | qualité du représentant de la Croix-Rouge (étape 8)                                         |
| `Structure de rattachement 1`, `Structure de rattachement 2` | `structure` (découpée si trop longue)                                                       |
| `nom / qualité`, `numéro de téléphone`                       | `guardian.lastName` + `guardian.firstName` / `guardian.quality`, `guardian.phone` (mineurs) |
| `Fait à`, `Jour`, `Mois`, `Année`                            | lieu et date de signature (étape 8)                                                         |
| `Signature parent`, `Signature 01`, `Signature`              | signatures (étape 8)                                                                        |

### Attestation-d_Aptitude (8 champs ; 6 viennent du dossier)

| Champ AcroForm                                                                                     | Donnée                                                                  |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `Prénom et nom du bénévole`                                                                        | `identity.firstName` + `identity.lastName`                              |
| `Jour de naissance du bénévole`, `Mois de naissance du bénévole`, `Année de naissance du bénévole` | `identity.birthDate`                                                    |
| `Lieu de naissance du bénévole`                                                                    | `identity.birthCity` (+ département)                                    |
| `Nom et ville de la structure`                                                                     | `structure`                                                             |
| `NIVOL`                                                                                            | NIVOL de la fiche (attribué par Gaia, étape 9), jamais le NIVOL déclaré |
| `Signature`                                                                                        | étape 8                                                                 |

## Seed

`pnpm db:seed:demo` ajoute :

- `P-00058` (Dossier) : un lien actif et un brouillon à moitié rempli, plus un ancien lien
  révoqué ;
- `P-00061` (Dossier) : un dossier envoyé d'une personne majeure, prêt à relire ; il déclare un
  NIVOL déjà attribué, pour montrer l'avertissement ;
- `P-00062` (Dossier) : un dossier envoyé d'un mineur de 15 ans, rempli sur place, avec son
  autorisation parentale (document `fileMissing`) ;
- `P-00059` (Gaia) : le dossier signé de l'étape 2, avec des données complètes ;
- un lien expiré (candidature abandonnée).

Les jetons du seed sont tirés au hasard et jetés : aucun n'est connu. Les tests créent leurs
liens par le service.

## Captures

| Écran                                    | Fichier                                                         |
| ---------------------------------------- | --------------------------------------------------------------- |
| Accueil du formulaire (390)              | `docs/captures/dossier-accueil-390.png`                         |
| Identité (390)                           | `docs/captures/dossier-identite-390.png`                        |
| Identité, champs à compléter (390)       | `docs/captures/dossier-identite-erreurs-390.png`                |
| Profil (390)                             | `docs/captures/dossier-profil-390.png`                          |
| Relecture et consentement (390)          | `docs/captures/dossier-relecture-390.png`                       |
| Page neutre (390)                        | `docs/captures/dossier-lien-invalide-390.png`                   |
| Lien créé, affiché une fois (1440)       | `docs/captures/dossier-lien-1440.png`                           |
| Bloc « Dossier » de l'onglet Intégration | `docs/captures/dossier-bloc-1440.png`                           |
| Revue du dossier (1440, 390)             | `docs/captures/dossier-revue-1440.png`, `dossier-revue-390.png` |
| Mode sur place, non ouvert (390)         | `docs/captures/dossier-sur-place-390.png`                       |

## Points ouverts

- Le texte `RGPD_NOTICE` du seed est un **brouillon à faire valider par le DPO**.
- La liste des activités proposées (`ACTIVITY_OPTIONS`, `src/lib/dossierForms.ts`) est à
  confirmer avec l'unité locale.
- L'attribution de `Nom_2` / `Nom_3` dans la Charte est à vérifier sur le PDF (étape 8).
