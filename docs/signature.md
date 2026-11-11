# Signature électronique et documents officiels (étape 8)

Après l'envoi du dossier en ligne (`docs/dossier.md`), le candidat signe les trois documents
officiels depuis son téléphone ; pour un mineur, son représentant légal signe aussi ; un
responsable contresigne la charte pour la Croix-Rouge française. Binivol remplit les PDF,
les aplatit, les range et les envoie. **Aucun service de signature externe** n'est utilisé.

## Parcours

1. **Envoi.** Le dossier passe à `SUBMITTED`. Le lien ne rouvre plus le formulaire : seulement
   les écrans de signature (ADR-044).
2. **Signature du bénévole** (`/dossier`, sur son téléphone) :
   1. « Signature de ton dossier » : les trois documents, avec un **aperçu PDF** de chacun,
      généré à la volée, marqué « Aperçu, non signé », **jamais stocké** ;
   2. le **tracé** (doigt, stylet ou souris ; « Effacer », « Valider »), ou, au clavier et pour
      les lecteurs d'écran, **le nom complet saisi**, affiché dans une police manuscrite
      (Caveat) ;
   3. le **code** à 6 chiffres reçu par e-mail ;
   4. la confirmation.
3. **Mineur** : « Au tour de ton représentant légal ». Il signe à son tour, avec un code envoyé
   sur **son propre e-mail** (`guardian.email`, différent de celui du candidat).
4. Toutes les signatures réunies : le dossier passe à `SIGNED`, le lien est marqué utilisé.
   Dans l'onglet Intégration, le bloc « Dossier » affiche « À contresigner ».
5. **Contresignature** (`/benevoles/[ref]/dossier/contresigner`, `dossier.manage`) : aperçu de
   la charte, qualité (par défaut le libellé du profil du responsable, modifiable), tracé ou nom
   saisi. La session du responsable tient lieu de vérification : pas de code. Puis, dans
   l'ordre :
   1. génération des 3 PDF finaux et de la preuve ;
   2. rangement dans le stockage (copie UL) ;
   3. en **une transaction** : preuve, `Document`, signature du représentant, dossier
      `COMPLETE`, candidature `FILE` → `GAIA` (machine de passage) ;
   4. e-mail au bénévole (et au représentant légal pour un mineur) : les 3 PDF, le règlement
      du bénévolat et le code de conduite.

   Une contresignature en cours est « réservée » (`countersignStartedAt`) : un second
   responsable qui contresigne en même temps est refusé. **Stockage indisponible** : la réserve
   est levée, rien n'est marqué signé côté UL, les fichiers déjà écrits sont effacés, le message
   est clair. **E-mail en échec** : les documents sont rangés, le bloc affiche « E-mail en échec »
   et le bouton « Renvoyer l'e-mail », qui renvoie la copie UL stockée (jamais régénérée).

Le **mode sur place** (`/benevoles/[ref]/dossier/sur-place`) propose le même parcours sur
l'appareil du responsable, avec une alternative au code : « J'ai vérifié l'identité de la
personne », au nom du responsable connecté.

## Méthodes de vérification

| Méthode     | Qui                    | Comment                                                              |
| ----------- | ---------------------- | -------------------------------------------------------------------- |
| `OTP_EMAIL` | bénévole, représentant | code à 6 chiffres reçu sur son e-mail, saisi dans les 10 minutes     |
| `IN_PERSON` | bénévole, représentant | sur place : le responsable connecté atteste avoir vérifié l'identité |
| `SESSION`   | représentant de la CRF | sa session (compte invité par TOPAZE)                                |

**Le code** (`src/server/signature/code.ts`) :

- tiré avec `crypto.randomInt`, 6 chiffres ;
- seule son empreinte est stockée : HMAC-SHA256 avec un sel aléatoire, sous une clé serveur
  (`OTP_SECRET`, ou dérivée d'`AUTH_SECRET`) ;
- valable **10 minutes**, **5 essais** au plus (le défi est alors bloqué : il faut un nouveau
  code) ;
- un nouveau code après **60 secondes** pour le même signataire, et **5 codes par heure** au plus
  par dossier ; le délai restant est affiché ;
- comparaison en temps constant (`timingSafeEqual`) ;
- l'e-mail du code ne contient **que** le prénom et le code (tutoiement, sans lien ni nom du
  dossier).

**Le tracé** (`src/server/signature/png.ts`) : PNG RVBA 8 bits, fond transparent, 1600 × 800
au plus, 500 Ko au plus ; un tracé vide, ou trop court (moins de 150 pixels encrés ou moins de
60 pixels de large), est refusé côté navigateur et côté serveur. Il est rangé dans le stockage
sous une clé aléatoire (`Signature.imageKey`). **Le nom saisi** doit être exactement le nom
complet du signataire (à la casse et aux accents près) ; il est enregistré tel quel
(`Signature.typedName`) et dessiné dans le PDF avec la police manuscrite.

## La preuve

Chaque signature est une ligne `Signature` :

- qui : nom, rôle (`VOLUNTEER`, `PARENT`, `CRF_REPRESENTATIVE`), qualité ;
- quand : horodatage **du serveur** ;
- comment : méthode, **e-mail vérifié** (celui qui a reçu le code), responsable ayant vérifié
  l'identité (sur place) ou contresigné ;
- le navigateur (`User-Agent`, tronqué) ;
- l'**empreinte de l'adresse IP** (HMAC-SHA256, jamais l'adresse elle-même) ;
- les **empreintes SHA-256 de chaque PDF final** (`documentHashes`, nom du fichier → empreinte).

Le document « **Preuve de signature** » (`NOM_Prénom_Preuve-de-signature.pdf`, une page,
généré par Binivol) récapitule ces éléments pour les trois documents. Il est rangé avec la
copie UL (`Document` de type `OTHER`) ; son propre SHA-256 est dans sa ligne `Document`.

Les PDF finaux sont **aplatis** (aucun champ modifiable) : toute modification change leur
empreinte, et la comparaison avec la preuve la révèle (`sha256sum` du fichier téléchargé).

## Modèles et police

- Les 5 PDF de `assets/modeles/` ont leur SHA-256 **figé dans le code**
  (`src/server/pdf/templates.ts`, ADR-047) : un modèle modifié bloque la génération avec un
  message clair (« Le modèle … ne correspond pas à l'empreinte attendue »).
- Police **Geist** (OFL, `assets/fonts/`), embarquée en sous-ensemble : accents, cédilles et
  caractères d'Europe de l'Est s'affichent (ADR-046). Les noms saisis comme signature utilisent
  **Caveat** (OFL).
- `pdf-lib` remplit les champs, pose les signatures dans le rectangle de leur champ (avec
  « Signé électroniquement le JJ/MM/AAAA » dessous), puis aplatit (ADR-045).

## Copies et versions

- **Copie UL** : les 3 PDF finaux et la preuve, rangés dans le stockage comme `Document`
  (`DOSSIER`, `CHARTE`, `APTITUDE`, `OTHER`), copie `UL`, téléchargés depuis l'onglet Documents
  (droits vérifiés, `AccessLog`, `Content-Disposition` avec `filename*`).
- **Copie bénévole** : les mêmes 3 PDF, envoyés en pièces jointes ; ils ne sont **pas stockés une
  seconde fois** (ADR-048) : leur empreinte est dans la preuve.
- **Rien n'est régénéré en silence** : un nouveau document crée une nouvelle version
  (`Document.version`), l'ancienne est archivée (`archivedAt`), jamais effacée.

## Valeur juridique, en termes honnêtes

Il s'agit d'une **signature électronique simple** au sens du règlement eIDAS (UE n° 910/2014,
article 25) :

- elle **ne peut pas être refusée** comme preuve en justice au seul motif qu'elle est
  électronique ;
- mais elle **n'a pas de présomption de fiabilité** (contrairement à une signature qualifiée) :
  en cas de contestation, c'est à l'unité locale de démontrer, par un **faisceau d'éléments**,
  que la personne a bien signé et que le document n'a pas changé depuis.

Ce faisceau : l'e-mail vérifié par un code personnel (ou la vérification en présence par un
responsable identifié), l'horodatage du serveur, le navigateur, l'empreinte de l'IP, le tracé
(ou le nom saisi), les empreintes SHA-256 des fichiers finaux, et le journal d'audit.

**Ce que cela couvre** : l'engagement bénévole, la charte et l'attestation sur l'honneur, des
documents internes à l'association, pour lesquels la loi n'impose pas de forme particulière.

**Ce que cela ne couvre pas** : l'identité n'est pas vérifiée par une pièce d'identité à
distance (seul l'accès à la boîte e-mail est prouvé) ; il n'y a ni certificat qualifié, ni
horodatage par un tiers de confiance. Un acte qui exigerait une signature avancée ou qualifiée
ne doit pas passer par ce circuit. L'avis du DPO et du service juridique de la Croix-Rouge est
à recueillir avant l'usage réel.

## Conservation

Les documents signés, la preuve et les lignes `Signature` suivent la durée de conservation du
dossier du bénévole (paramètre `RETENTION_YEARS_AFTER_LEAVE`, 5 ans après le départ par
défaut) ; la purge relève de l'étape 14. Les codes (`otp_challenges`) ne gardent que leur
empreinte. Les images de tracé restent dans le stockage tant que le dossier existe.

## Démo hébergée

Sans stockage S3 (`STORAGE_DRIVER=local` sur Vercel, système de fichiers en lecture seule), un
tracé ne peut pas être rangé : le candidat peut signer en **saisissant son nom**. La
contresignature affiche le message « Le stockage des documents est indisponible : rien n'a été
signé côté unité locale ».

## Captures

| Écran                                                                               | Fichier                                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Au tour du représentant légal (390)                                                 | `docs/captures/signature-parent-390.png`                                                                    |
| Signature au clavier, nom en police manuscrite (390)                                | `docs/captures/signature-clavier-390.png`                                                                   |
| Code reçu par e-mail (390)                                                          | `docs/captures/signature-code-390.png`                                                                      |
| Dossier signé (390)                                                                 | `docs/captures/signature-signe-390.png`                                                                     |
| Bloc « Dossier » : en attente du parent, à contresigner                             | `signature-bloc-parent-1440.png`, `signature-bloc-acontresigner-1440.png`                                   |
| Contresignature, puis dossier complet                                               | `contresignature-1440.png`, `contresignature-faite-1440.png`                                                |
| Onglet Documents (copie UL)                                                         | `signature-documents-1440.png`                                                                              |
| Code dans `/admin/courriels` (pilote `log`)                                         | `courriels-code-1440.png`                                                                                   |
| PDF finaux du seed : dossier (p. 2), charte d'un mineur (p. 3), attestation, preuve | `pdf-final-dossier.png`, `pdf-final-charte-mineur.png`, `pdf-final-attestation.png`, `pdf-final-preuve.png` |
| Lecture des champs des modèles                                                      | `pdf-champs-dossier-1.png` à `-3.png`, `pdf-champs-charte.png`, `pdf-champs-attestation.png`                |
