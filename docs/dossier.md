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

| #   | Étape                     | Contenu                                                                                          |
| --- | ------------------------- | ------------------------------------------------------------------------------------------------ |
| 1   | Accueil                   | Présentation, durée, pièces à préparer                                                           |
| 2   | Identité                  | Civilité, nom, nom de naissance, nom d'usage, prénom, second prénom, naissance                   |
| 3   | Coordonnées               | Adresse, pays, téléphones et e-mails personnels et professionnels                                |
| 4   | Croix-Rouge               | Déjà bénévole, NIVOL déclaré, e-mail Croix-Rouge déclaré, activités souhaitées (4 au plus)       |
| 5   | Personne à prévenir       | Une personne : civilité, nom, prénom, lien, adresse, téléphones, e-mail                          |
| 6   | Profil                    | Profession, secteur, entreprise ; 4 compétences, 3 langues (avec niveaux), 5 diplômes, 4 permis  |
| 7   | Représentant légal        | **Mineurs seulement** : nom, prénom, qualité, téléphone                                          |
| 8   | Pièces jointes            | Autorisation parentale (mineurs), demande d'adhésion ; pas de copie de diplôme (Pegass, ADR-049) |
| 9   | Relecture et consentement | Résumé par étape (« Modifier »), points à compléter, information RGPD, envoi                     |
| —   | Confirmation              | « Votre dossier a bien été envoyé »                                                              |

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

- **moins de 18 ans** : l'étape « Représentant légal » apparaît ; nom, prénom, qualité,
  téléphone et **e-mail** sont obligatoires. L'e-mail doit être le sien (différent de celui du
  candidat) : il y reçoit le code qui lui permet de signer la charte (étape 8) ;
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
- **Usage** (ADR-039, ADR-044) : le lien reste réutilisable pour reprendre le brouillon jusqu'à
  l'envoi. Entre l'envoi et la signature, il ne rouvre que les **écrans de signature** (le
  formulaire ne se modifie plus) ; `usedAt` le ferme à la **signature complète** (le bénévole, et
  le représentant légal pour un mineur). Un nouveau lien révoque les précédents ; le dossier en
  cours (brouillon ou envoyé non signé) est **rattaché au nouveau lien**.
- **Session expirée** : les actions répondent « Votre session a expiré… » ; ce qui est à l'écran
  reste affiché, et rouvrir le lien (s'il est valable) relance la session.
- **Actions publiques** : `src/app/(public)/dossier/actions.ts`, cinq actions par
  `definePublicAction` (échanger le jeton, enregistrer, ajouter et retirer une pièce, envoyer). Chacune relit le
  cookie et le lien ; la personne et le brouillon viennent du lien, jamais de l'entrée. La liste
  fermée du test d'architecture les nomme.
- **Journaux de la plateforme** : grâce au fragment, le jeton n'y figure jamais (ADR-043).

## Pièces jointes

**Aucune copie de diplôme** n'est demandée ni acceptée (ADR-049) : « Tes diplômes seront vérifiés
dans Pegass, tu n'as pas à les envoyer. » Le type `DIPLOMA_COPY` reste dans l'énumération (des
lignes anciennes peuvent exister et restent consultables), mais tout nouveau dépôt de ce type est
refusé, dans le dossier comme dans l'onglet Documents.

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

## Adresses proposées pendant la saisie (étape 16, ADR-068)

- Champs concernés : « Numéro et voie », « Code postal », « Ville » des Coordonnées, et
  « Adresse », « Code postal », « Ville » de la personne à prévenir. Après 3 caractères et
  250 ms, une liste propose jusqu'à 5 adresses ; en choisir une **préremplit** voie, code
  postal, ville et pays (France). Tout reste modifiable ; « Je ne trouve pas mon adresse »
  ferme la liste et laisse la saisie libre (étranger, lieu-dit…).
- **Code postal seul** : les communes (78120 → Rambouillet, Clairefontaine en Yvelines…) ;
  **ville seule** : ses codes postaux. Source locale : la « Base officielle des codes postaux »
  de La Poste (data.gouv.fr, **Licence Ouverte 2.0**), réduite par `pnpm geo:postal-codes
<laposte_hexasmal.csv>` en `src/server/geo/postal-codes.txt` (35 511 lignes `CP;COMMUNE;INSEE`).
  Aucun appel réseau pour ce cas. Les noms sont en capitales sans accents chez La Poste :
  affichés « Clairefontaine en Yvelines » (accents non restituables, champ modifiable).
- **Rues** : API Adresse de la Géoplateforme (Base Adresse Nationale, IGN, gratuite, sans clé),
  `https://data.geopf.fr/geocodage/search?q=…&autocomplete=1&limit=5&index=address`, appelée
  **par le serveur seulement** (`AddressService`, `src/server/geo/address.ts`) : délai de 2 s,
  tout échec donne « aucune proposition » (la saisie libre continue).
- **Le navigateur du candidat n'appelle jamais un tiers** : il envoie le texte à
  `POST /dossier/adresse` (dans le corps, jamais dans l'adresse) ; la route exige le cookie de
  dossier (sinon 401), valide la requête (Zod, 3 à 120 caractères), limite à 200 demandes par
  dossier et par 15 minutes (`rate_limits`, clé hachée), répond `no-store`. **Le texte tapé
  n'est jamais journalisé** (ni log, ni `access_logs`, ni audit) ni mis en cache. En mode sur
  place, la même fonction passe par une action `dossier.manage`.
- `ADDRESS_PROVIDER` : `ban` (défaut), `none` (pas de rue proposée, codes postaux locaux
  seulement), `fake` (tests : rues fictives, refusé hors connexion démo et sur Vercel).
- Accessibilité : motif « combobox » ARIA (↓ ↑, Entrée, Échap), nombre de résultats annoncé,
  options de 44 px, champs à 16 px, `autocomplete="street-address"`, `postal-code`,
  `address-level2` conservés pour le remplissage automatique du téléphone.
- La notice d'information (brouillon `RGPD_NOTICE`) et l'aide sous les champs d'adresse disent
  que le texte tapé est transmis au service public Base Adresse Nationale.

## Diplômes déclarés (étape 16)

- Le champ « Diplômes » (5 au plus) se choisit dans une liste avec recherche, groupée (grand
  public, secourisme en équipe, encadrement opérationnel, aquatique, formateurs, autres), puis
  « Autre (préciser) » en texte libre. Catalogue : paramètre `DECLARED_DIPLOMA_CATALOG`
  (Paramètres → Dossier en ligne, une ligne « code | libellé | groupe | référentiel »).
- Codes alignés sur le référentiel quand il a la même chose (PSC, GQS, FCPSE, FPSC, FPSE,
  TCAU) ; PSE1 et PSE2 renvoient à l'item `PSE` du référentiel (qui ne distingue pas les
  niveaux) ; IPS, SST, AFGSU, BNSSA, SSA, CE, CP, formateur SST, formateur de formateurs n'y
  sont pas : ils restent déclaratifs. CEAT n'existe pas dans le référentiel : non proposé.
- Pour chaque diplôme : année (facultative, AAAA, entre 1950 et l'année en cours) et organisme
  (Croix-Rouge, Protection civile, SDIS, employeur, autre). Version 3 du JSON du dossier ; un
  diplôme en texte d'une version antérieure se relit `{ label }`.
- Report dans la fiche : `person_declared_diplomas.code`, `year`, `issuer` (migration
  `20261114090000_declared_diploma_details`, CHECK sur l'année).
- Onglet Formations de la fiche : « Déclarés dans le dossier » **propose** (jamais
  automatiquement), à qui a `training.write`, d'ouvrir la qualification « à vérifier dans
  Pegass » (résultat `TO_CONFIRM`, datée du 1er janvier de l'année déclarée). Toujours aucune
  copie de diplôme demandée (ADR-049).
- PDF : les cases `Diplome 1` à `Diplome 5` reçoivent le libellé, suivi de l'année entre
  parenthèses quand elle est connue.

## Copier le dossier reçu (étape 16)

- Sur la relecture (`dossier.manage`), après « Afficher le dossier » (consultation journalisée,
  contexte « dossier ») : un bouton « Copier » par valeur (nom accessible « Copier <champ> »,
  confirmation « Copié » discrète), « Copier la section » par carte, « Tout copier » en haut
  (texte tabulé `Champ<TAB>Valeur`, une ligne par champ, dans l'ordre du dossier).
- Formats : dates `JJ/MM/AAAA`, NOM en capitales, téléphones `+33 6 12 34 56 78` ou
  `0612345678` au choix, adresse champ par champ ou en une ligne ; les deux choix sont
  mémorisés dans le navigateur (simple confort).
- Avant l'affichage, aucune valeur ni bouton : rien n'est copiable tant que c'est masqué.
  Copier ne charge rien de plus et n'écrit rien en base.
- Mêmes composants que la fiche Gaia (étape 9) : `CopyField` et `CopyAllButton`
  (`src/components/ui/CopyField.tsx`), formats dans `src/lib/copyFormat.ts`.

## Correspondance avec les PDF (étape 8)

La correspondance est dans `src/server/pdf/mappings.ts` (un objet par modèle, nom exact du champ
vers valeur) ; un test charge chaque modèle et vérifie que tous ses champs sont remplis, signés
ou notés « volontairement vides ». Les cases valent `/Oui` ou `/Off`. Les dates sont découpées en
`JJ`, `MM`, `AAAA` au fuseau de Paris ; la date de signature est celle de la signature du
bénévole. Les PDF finaux sont **aplatis** : plus aucun champ modifiable (ADR-045).

Lecture des modèles : chaque champ a été rempli avec son propre nom, puis les pages converties
en images (`pdftoppm`). Images : `docs/captures/pdf-champs-dossier-1.png` à `-3.png`,
`pdf-champs-charte.png`, `pdf-champs-attestation.png`.

### Dossier-Bénévole (89 champs : 85 remplis, 1 signature, aucun vide)

Lecture : la page 1 (couverture) porte `Nom`, `Prénom` et `Structure de rattachement`. En page
2, la ligne « Prénom* » est le champ **`Prénom - 2`** (pas un second prénom) et la ligne « Nom
de naissance* » est obligatoire : on y met le nom de naissance, ou le nom à défaut. Les cases
correspondent bien à leur libellé (vérifié sur l'image).

| Champ(s) AcroForm                                                 | Donnée                                                           |
| ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Nom`, `Prénom` (page 1)                                          | `identity.lastName`, `identity.firstName`                        |
| `Structure de rattachement` (page 1)                              | paramètre `UL_NAME`                                              |
| `Nom de naissance`, `Nom d'usage`                                 | `identity.birthName` (à défaut `lastName`), `identity.usageName` |
| `Prénom - 2` (ligne « Prénom* » de la page 2)                     | `identity.firstName`, suivi de `secondFirstName` s'il existe     |
| `Civilité - Mme`, `Civilité - M`                                  | `identity.civility`                                              |
| `Jour naissance`, `Mois naissance`, `Année naissance`             | `identity.birthDate`                                             |
| `Ville naissance`, `Département naissance`, `Pays naissance`      | `identity.birthCity`, `birthDepartment`, `birthCountry`          |
| `Numéro et voie résidence`, `Complément adresse résidence`        | `contact.street`, `contact.addressComplement`                    |
| `Code postal et ville résidence`, `Pays résidence`                | `contact.postalCode` + `city`, `contact.country`                 |
| `Téléphone personnel`, `Email personnel`                          | `contact.phone` (formaté), `contact.email`                       |
| `Téléphone professionnel`, `Email professionnel`                  | `contact.proPhone`, `contact.proEmail`                           |
| `Déjà bénévole - OUI` / `- NON`                                   | `crf.alreadyVolunteer`                                           |
| `NIVOL - Oui` / `- Non`, `NIVOL`                                  | `crf.hasNivol`, `crf.nivol` (déclaré par le candidat)            |
| `Mail CRf - OUI` / `- NON`, `Mail CRf`                            | `crf.hasCrfEmail`, `crf.crfEmail` (déclaré)                      |
| `Civilité urgence - Mme` / `- M`                                  | `emergency.civility`                                             |
| `Nom urgence`, `Prénom urgence`, `Lien de parenté urgence`        | `emergency.lastName`, `firstName`, `relationship`                |
| `Adresse urgence`, `Code Postal et ville urgence`, `Pays urgence` | `emergency.address`, `postalCode` + `city`, `country`            |
| `Email urgence`, `Téléphone 1 urgence`, `Téléphone 2 urgence`     | `emergency.email`, `phone1`, `phone2`                            |
| `Jour signature`, `Mois signature`, `Année signature`             | date de la signature du bénévole                                 |
| `Signature`                                                       | **signature du bénévole** (image ou nom saisi)                   |
| `Activité 1` à `Activité 4`                                       | `crf.activities`                                                 |
| `Compétence 1` à `4`, et `- Débutant` / `- Confirmé` / `- Expert` | `profile.skills[i].label` et `.level`                            |
| `Profession`, `Secteur professionnel`, `Entreprise`               | `profile.profession`, `sector`, `company`                        |
| `Langue 1` à `3`, et `- Notions` / `- Courant` / `- Bilingue`     | `profile.languages[i].label` et `.level`                         |
| `Diplome 1` à `Diplome 5`                                         | `profile.diplomas`                                               |
| `Permis 1` à `Permis 4`                                           | `profile.licenses` (« Permis B »…)                               |

### Charte-du-Bénévolat (18 champs : 15 remplis, 3 signatures)

Lecture sur le PDF (page 3, `docs/captures/pdf-champs-charte.png`) :

- **« Pour le bénévole »** (colonne gauche) : `Fait à`, `Jour` / `Mois` / `Année`, `Nom`,
  `Prénom`, puis « Personne à contacter en cas d'urgence (nom / qualité / numéro de
  téléphone) » : `nom / qualité` et `numéro de téléphone` ; enfin « Votre signature » :
  `Signature`.
- **« Pour la Croix-Rouge française »** (colonne droite) : `Nom_2`, `Prénom_2`, `Qualité`,
  `Structure de rattachement 1` (ligne courte) et `2`, puis la signature `Signature 01`.
- **« Pour le bénévole mineur de moins de 16 ans »** (en bas à droite) : « Le parent /
  représentant légal », `Nom_3`, `Prénom_3`, et `Signature parent`.

| Champ(s) AcroForm                      | Donnée                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `Fait à`                               | paramètre `UL_CITY` (« Versailles »)                                     |
| `Jour`, `Mois`, `Année`                | date de la signature du bénévole                                         |
| `Nom`, `Prénom`                        | le bénévole                                                              |
| `nom / qualité`, `numéro de téléphone` | la personne à prévenir : « Prénom Nom / lien de parenté », téléphone 1   |
| `Signature`                            | **signature du bénévole**                                                |
| `Nom_2`, `Prénom_2`, `Qualité`         | le **représentant de la Croix-Rouge** qui contresigne (qualité éditable) |
| `Structure de rattachement 1`, `2`     | `UL_NAME`, découpé sur les deux lignes                                   |
| `Signature 01`                         | **signature du représentant de la Croix-Rouge**                          |
| `Nom_3`, `Prénom_3`                    | le **représentant légal** (mineur), vide sinon                           |
| `Signature parent`                     | **signature du représentant légal** (mineur)                             |

La charte limite le bloc parent aux « moins de 16 ans » ; Binivol fait signer le représentant
légal de **tout mineur** (moins de 18 ans), comme le demande le cahier : point à confirmer.

### Attestation-d_Aptitude (8 champs : 6 remplis, 1 signature, 1 volontairement vide)

Lecture : la ligne « Date » à côté de la signature réutilise les trois champs de la date de
naissance (chaque champ a **deux widgets**). Binivol détache le second widget de chacun et y
écrit la date de signature : sinon la date de naissance s'afficherait comme date de signature.

| Champ AcroForm                                          | Donnée                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `Prénom et nom du bénévole`                             | `identity.firstName` + `lastName`                                                     |
| `Jour/Mois/Année de naissance du bénévole` (1er widget) | `identity.birthDate`                                                                  |
| mêmes champs, 2e widget (ligne « Date »)                | date de la signature du bénévole                                                      |
| `Lieu de naissance du bénévole`                         | `identity.birthCity` (département)                                                    |
| `Nom et ville de la structure`                          | « Croix-Rouge française, » + `UL_NAME`                                                |
| `NIVOL`                                                 | **volontairement vide** : le NIVOL n'existe pas encore ; l'étape 9 (Gaia) le complète |
| `Signature`                                             | **signature du bénévole**                                                             |

### Noms des fichiers

`NOM_Prénom_Dossier-Bénévole.pdf`, `NOM_Prénom_Charte-du-Bénévolat.pdf`,
`NOM_Prénom_Attestation-d_Aptitude.pdf` (et `NOM_Prénom_Preuve-de-signature.pdf`) : NOM en
capitales, Prénom avec une capitale à chaque partie, accents gardés, espaces en `-`, caractères
interdits retirés (`documentFileName`, `src/lib/fileNames.ts`). Le téléchargement envoie
`Content-Disposition` avec `filename*` (RFC 5987). Les valeurs trop longues pour un champ sont
réduites (police jusqu'à 6 pt), puis coupées proprement avec « … », jamais débordantes.

## Seed

`pnpm db:seed:demo` ajoute :

- `P-00058` (Dossier) : un lien actif et un brouillon à moitié rempli, plus un ancien lien
  révoqué ;
- `P-00061` (Dossier) : un dossier d'une personne majeure, **signé par le bénévole, à
  contresigner** ; il déclare un NIVOL déjà attribué, pour montrer l'avertissement de la revue ;
- `P-00062` (Dossier) : un dossier d'un mineur de 15 ans, rempli et **signé sur place par le
  bénévole, en attente du représentant légal**, avec son autorisation parentale (document
  `fileMissing`) ;
- `P-00059` (Gaia) : un dossier **complet** (contresigné), dont les 3 PDF et la preuve sont des
  documents UL marqués `fileMissing` : le seed n'écrit pas dans le stockage ;
- un lien expiré (candidature abandonnée).

Les signatures du seed sont des noms saisis (aucun fichier à relire) : la contresignature de
`P-00061` fonctionne en local avec le pilote de stockage `local`. Les jetons du seed sont tirés
au hasard et jetés : aucun n'est connu. Les tests créent leurs liens par le service.

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
- La charte réserve le bloc parent aux moins de 16 ans ; Binivol le fait signer pour tout mineur.
