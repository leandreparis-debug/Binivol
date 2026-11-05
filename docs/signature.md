# Signature électronique et documents officiels (étape 8)

Le dossier envoyé par le candidat (`docs/dossier.md`) devient trois PDF officiels signés : le
dossier bénévole, la charte du bénévolat et l'attestation d'aptitude. Il n'y a **aucun service de
signature externe** : Binivol produit une signature électronique **simple**, dont la valeur vient
d'un faisceau de preuves.

## Parcours

1. **Envoi.** Le candidat envoie son dossier (`SUBMITTED`). Son lien n'est pas consommé : il ne
   rouvre plus que les écrans de signature, le formulaire n'est plus modifiable (ADR-045).
2. **Documents.** L'écran « Signature » liste les trois documents, avec un aperçu PDF de chacun
   **avant signature**, généré à la volée, marqué « Aperçu » et jamais stocké
   (`/dossier/apercu/[document]`).
3. **Tracé.** Le candidat trace sa signature au doigt, au stylet ou à la souris (« Effacer »,
   « Valider la signature »). Au clavier ou avec un lecteur d'écran, « Saisir mon nom » remplace
   le tracé par le nom complet, rendu dans une police manuscrite (Caveat). Un tracé vide ou trop
   court est refusé dans le navigateur, puis à nouveau par le serveur, qui décode le PNG.
4. **Code.** « Recevoir mon code » envoie un code à 6 chiffres sur l'e-mail du dossier. Le
   candidat le saisit, puis « Signer ».
5. **Représentant légal** (mineur). L'écran « Au tour de ton représentant légal » suit : son
   propre tracé, et un code envoyé sur **son** e-mail (`guardian.email`, version 2 du dossier).
6. **Fin côté candidat.** Quand le bénévole (et le représentant légal d'un mineur) ont signé, le
   lien est marqué utilisé (`usedAt`) : il donne ensuite la page neutre.
7. **Contresignature.** Dans l'onglet Intégration, bloc « Dossier », l'état passe à « À
   contresigner ». Un responsable (`dossier.manage` : DIAMANT ou TOPAZE) ouvre « Contresigner » :
   aperçu de la charte, nom, prénom et qualité (par défaut le libellé de son profil, modifiable),
   tracé ou nom saisi. Sa session Google tient lieu de vérification : pas de code.
8. **Finalisation**, dans cet ordre, reprise proprement en cas d'échec :
   1. génération des trois PDF finaux et de la preuve (rien n'est écrit) ;
   2. rangement dans le stockage (tout ou rien : en cas d'échec, les fichiers déjà écrits sont
      retirés, **rien n'est marqué signé** et le message le dit) ;
   3. **une transaction** : signature du représentant, empreintes reportées dans chaque
      signature, `Document` de copie UL (dossier, charte, attestation, preuve), anciennes versions
      archivées, dossier `SIGNED`, candidature `FILE` → `GAIA` par la machine (`CandidacyEvent`) ;
   4. e-mail au bénévole (et au représentant légal d'un mineur) avec les trois PDF, le règlement
      et le code de conduite. S'il échoue, les documents restent rangés et « Renvoyer l'e-mail »
      apparaît ; le renvoi relit les fichiers stockés, il ne régénère rien.

États du bloc « Dossier » : envoyé, signé par le bénévole, signé par le représentant légal, à
contresigner, complet ; e-mail envoyé, en échec ou non envoyé.

## Méthodes d'identification

| Méthode     | Qui              | Comment                                                                                   |
| ----------- | ---------------- | ----------------------------------------------------------------------------------------- |
| `OTP_EMAIL` | bénévole, parent | code à 6 chiffres envoyé sur l'e-mail du dossier                                          |
| `IN_PERSON` | bénévole, parent | mode sur place : le responsable connecté coche « J'ai vérifié l'identité de la personne » |
| `SESSION`   | représentant CRF | la session Google du responsable (`@croix-rouge.fr`)                                      |

Le mode sur place (`/benevoles/[ref]/dossier/sur-place`) propose les deux : le code, ou la
vérification en présence. La méthode et le nom du responsable sont enregistrés dans la preuve.

### Règles du code

- 6 chiffres tirés avec `crypto.randomInt` ;
- seule une empreinte est stockée : `OtpChallenge.codeHash` = `v1.<sel>.<HMAC-SHA256>`, clé
  serveur dérivée de `SIGNATURE_HMAC_SECRET` (ou, à défaut, d'`AUTH_SECRET`) ;
- valable **10 minutes**, **5 essais** au plus (puis bloqué : il faut un nouveau code) ;
- un nouvel envoi **60 secondes** après le précédent au plus tôt, **5 par heure** et par dossier ;
- comparaison en temps constant (`timingSafeEqual`) ;
- l'e-mail ne contient **que** le code et le prénom (tutoiement, sans tiret cadratin) ; sur la
  démo (`MAIL_DRIVER=log`), il se lit dans Administration › Courriels.

Messages : « Code incorrect. Il te reste N essais. », « Trop d'essais : demande un nouveau
code. », « Ce code a expiré : demande un nouveau code. », « Un code vient d'être envoyé. Tu
pourras en demander un nouveau dans N secondes. ».

## Contenu de la preuve

Chaque `Signature` enregistre :

- qui : nom, qualité, rôle (`VOLUNTEER`, `PARENT`, `CRF_REPRESENTATIVE`) ;
- quand : horodatage du serveur ;
- comment : méthode, e-mail vérifié ou nom du responsable, tracé ou nom saisi ;
- d'où : le navigateur (`User-Agent`, tronqué) et une **empreinte HMAC de l'adresse IP**, jamais
  l'adresse ;
- l'image de la signature (PNG, fond transparent, au plus 1600 × 800 et 200 ko) dans le
  stockage, sous une clé aléatoire (`signatures/…`) ;
- les empreintes SHA-256 des trois PDF finaux (`documentHashes`, nom de fichier → empreinte).

Le document « **Preuve de signature** » (PDF d'une page, `NOM_Prénom_Preuve-de-signature.pdf`)
récapitule ces éléments pour les trois documents. Il est rangé avec la copie UL (`Document` de
type `OTHER`).

## Les PDF

- `pdf-lib` et `@pdf-lib/fontkit`, police Unicode embarquée (Geist, OFL) : accents, cédilles,
  lettres d'Europe de l'Est (« Łucja Ñúñez-O'Brien »).
- Correspondance champ par champ : `src/server/pdf/mappings.ts` (détail dans
  `docs/dossier.md`). Un test vérifie que chaque champ existe et qu'aucun n'est oublié.
- Texte ajusté à chaque champ : taille réduite de 9 à 6 points, puis coupé avec « … », jamais
  débordant.
- Signatures : l'image est posée dans le rectangle du champ (proportions gardées), avec la ligne
  « Signé électroniquement le JJ/MM/AAAA » dessous.
- **Aplatissement** : les PDF finaux n'ont plus aucun champ modifiable.
- **Modèles intègres** : l'empreinte SHA-256 de chaque modèle et de chaque police est figée dans
  `src/server/pdf/templates.ts`. Un modèle modifié bloque la génération avec un message clair
  (« Le modèle … a été modifié »). Pour changer de modèle : vérifier ses champs, mettre à jour
  la correspondance, puis l'empreinte.
- Nomenclature : `NOM_Prénom_Dossier-Bénévole.pdf`, `NOM_Prénom_Charte-du-Bénévolat.pdf`,
  `NOM_Prénom_Attestation-d_Aptitude.pdf` (NOM en majuscules, accents gardés, espaces en `-`,
  caractères interdits retirés). Téléchargement avec `Content-Disposition` et `filename*`
  (RFC 5987).
- Les fichiers `assets/modeles/` et `assets/fonts/` sont livrés avec chaque fonction serveur
  (`outputFileTracingIncludes`) et copiés dans l'image Docker.

## Copies

- **Copie UL** : les trois PDF finaux et la preuve, dans le stockage, comme `Document` de copie
  `UL`, rattachés au dossier signé (`submissionId`). Téléchargement journalisé (`DOCUMENT_VIEW`).
- **Copie bénévole** : les mêmes trois PDF, envoyés en pièces jointes, **pas stockés une seconde
  fois** ; leurs empreintes sont dans la preuve. Le pilote `log` ne garde que le nom, la taille
  et l'empreinte des pièces jointes (`/admin/courriels`).
- Rien n'est régénéré en silence : un nouveau document crée une nouvelle version, l'ancienne est
  archivée, jamais effacée.

## Valeur juridique, en termes honnêtes

C'est une **signature électronique simple** au sens du règlement (UE) n° 910/2014 (eIDAS,
article 25). Elle est recevable en justice, mais sa force dépend de ce qu'on peut prouver :

- **ce qu'elle établit** : qu'une personne ayant accès à l'adresse e-mail du dossier (ou dont
  l'identité a été vérifiée en présence par un responsable nommé) a validé ces documents, à cette
  date, depuis ce navigateur ; et que les fichiers n'ont pas changé depuis (empreintes) ;
- **ce qu'elle n'établit pas** : l'identité civile du signataire au sens fort (aucune pièce
  d'identité vérifiée à distance, aucun certificat qualifié), ni l'absence de partage de la boîte
  e-mail. Ce n'est **ni une signature avancée ni une signature qualifiée** ;
- en cas de contestation, la charge de la preuve revient à la Croix-Rouge française. Pour les
  cas sensibles, le mode sur place (vérification en présence) renforce le faisceau.

## Conservation

- Les documents signés et la preuve suivent la durée de conservation des dossiers bénévoles
  (paramètre `RETENTION_YEARS_AFTER_LEAVE`, 5 ans après le départ, purge de l'étape 14).
- Les images de signature et les défis de code restent liés au dossier ; un défi expiré ne
  contient que l'empreinte du code.
- Aucun fichier n'a d'URL publique ni présignée (`docs/storage.md`).

## Démo hébergée

Sans stockage S3, la démo hébergée refuse la signature dès l'écran (« La signature n'est pas
disponible sur cette démo : le stockage des documents n'est pas configuré »), et la
contresignature affiche le même message. Le seed de démonstration montre les états sans écrire
dans le stockage : un dossier signé par le bénévole à contresigner, un dossier complet (documents
`fileMissing`), un mineur en attente de son représentant légal.

## Captures

| Écran                                   | Fichier                                                    |
| --------------------------------------- | ---------------------------------------------------------- |
| Documents à signer (390)                | `docs/captures/signature-documents-390.png`                |
| Tracé (390)                             | `docs/captures/signature-trace-390.png`                    |
| Nom saisi, alternative clavier (390)    | `docs/captures/signature-nom-390.png`                      |
| Code (390)                              | `docs/captures/signature-code-390.png`                     |
| Confirmation (390)                      | `docs/captures/signature-confirmation-390.png`             |
| Bloc « Dossier », à contresigner (1440) | `docs/captures/signature-bloc-1440.png`                    |
| Contresignature (1440)                  | `docs/captures/contresignature-1440.png`                   |
| Bloc « Dossier », complet (1440)        | `docs/captures/signature-complet-1440.png`                 |
| Onglet Documents après signature (1440) | `docs/captures/signature-documents-1440.png`               |
| PDF finaux (fictifs) rendus en image    | `docs/captures/pdf-final-{dossier,charte,attestation}.png` |
