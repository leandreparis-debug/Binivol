## Étape 8 — Signature électronique et PDF officiels

### 0. Corrections préalables (issues de la revue de l'étape 7)

1. **Mise à jour de `main` et modèles.**
   - Si `main` est un ancêtre direct de `claude/quirky-johnson-9av6kd` (ou l'inverse, si les PDF ont été déposés sur la branche), aligne-les par **avance rapide** (jamais de `--force`) ; sinon, **arrête-toi** et signale-le.
   - Vérifie que l'étape 7 est présente (`docs/dossier.md`, `src/server/mail/`).
   - Vérifie que `assets/modeles/` contient les **5 PDF officiels** : le dossier, la charte, l'attestation, le règlement et le code de conduite. S'il en manque un, **arrête-toi** et dis lequel. Ne fabrique jamais de modèle de remplacement.
2. **Seed de la démo hébergée.** Quand `AUTH_DEMO_ON_VERCEL=true`, la base est une démo, fictive par définition. Dans ce cas, `seed:demo` **accepte** les personnes créées hors seed : il ne les modifie pas, il les liste dans le journal de build, et il ajoute ou met à jour ses propres données comme d'habitude. Partout ailleurs, le refus strict reste inchangé. Mets à jour l'ADR et les tests du script.
3. **Jeton après `#`.**
   - Le lien envoyé devient `/dossier/ouvrir#<jeton>`. La page lit le jeton côté navigateur, l'envoie par une requête `POST` à l'action publique d'échange (qui pose le cookie), efface le fragment de l'adresse (`history.replaceState`), puis affiche `/dossier`.
   - Le jeton ne passe donc **jamais** dans une adresse reçue par le serveur, ni dans un journal d'accès.
   - Retire l'ancienne route avec le jeton dans le chemin : aucun vrai lien n'a été envoyé.
   - Mets à jour l'e-mail, les tests (dont un test qui prouve que la requête de la page ne contient pas le jeton), `docs/dossier.md`, la liste fermée des actions publiques et son test.
4. **Test instable.** Retrouve le test unitaire qui a échoué une fois (relance `pnpm verify` en boucle, avec un ordre aléatoire si l'outil le permet). Corrige la cause : date du jour, fuseau, ordre ou état partagé. Dis laquelle dans le récap. Si tu ne le retrouves pas en 30 relances, dis-le simplement.
5. **Moment où le lien est consommé.**
   - Le lien (`usedAt`) est désormais marqué utilisé **à la signature complète** du candidat (et du représentant légal pour un mineur), plus à l'envoi.
   - Entre l'envoi et la signature, le lien ne rouvre que l'écran de signature : le formulaire n'est plus modifiable.
   - Ajuste les tests de l'étape 7.
6. **Représentant légal.** Ajoute son **e-mail**, obligatoire pour un mineur, dans le formulaire, le schéma Zod (avec une montée de `schemaVersion` et la migration du JSON), la revue et `docs/dossier.md`.

### Contexte

Binivol est l'outil de gestion des bénévoles de l'unité locale de Versailles de la Croix-Rouge française. Lis `CLAUDE.md`, `docs/decisions.md`, `docs/dossier.md`, `docs/mail.md`, `docs/storage.md` et `docs/permissions.md`.

À l'étape 7, le candidat remplit son dossier en ligne jusqu'à l'envoi (`SUBMITTED`). Cette étape ajoute plusieurs choses :

- la **signature électronique simple** : un tracé au doigt, puis un code reçu par e-mail ;
- le **remplissage des 3 PDF officiels** (AcroForm) avec la bonne nomenclature ;
- la **contresignature** de la charte par le responsable ;
- l'**envoi des documents** au bénévole, avec le règlement et le code de conduite ;
- la **preuve** (horodatage, e-mail, empreintes SHA-256).

Il n'y a **aucun service de signature externe**. C'est une signature électronique _simple_ au sens d'eIDAS : sa valeur vient d'un faisceau de preuves, à documenter honnêtement.

Les modèles sont dans `assets/modeles/`. Les noms exacts de leurs champs sont listés dans `docs/dossier.md`. **Hors périmètre** : l'assistant Gaia (étape 9).

### Objectif (prompt « directif » sur la sécurité, « objectif » sur l'interface)

1. Après l'envoi, le candidat **signe** sur l'écran : il trace sa signature, reçoit un code à 6 chiffres par e-mail et le saisit. Pour un mineur, le **représentant légal** signe aussi, avec son propre code reçu sur son e-mail.
2. Binivol **remplit les 3 PDF** depuis le dossier, y pose les signatures, les **aplatit** (plus modifiables) et calcule leurs empreintes SHA-256.
3. Un responsable (DIAMANT ou TOPAZE) **contresigne la charte** depuis l'app, en tant que représentant de la Croix-Rouge.
4. Une fois la charte contresignée :
   - les documents finaux sont rangés dans le stockage (copie UL) ;
   - un **e-mail** part au bénévole avec ses 3 PDF, le règlement et le code de conduite ;
   - une **preuve de signature** est produite ;
   - la candidature passe de `FILE` à `GAIA` par la machine de passage.

### Règles de sécurité et de preuve

- **Code** :
  - 6 chiffres, tirés avec `crypto.randomInt` ;
  - seule l'**empreinte** est stockée (`OtpChallenge.codeHash`, avec un sel ou un HMAC sur une clé serveur) ;
  - valable 10 minutes, 5 essais au plus ;
  - un nouvel envoi n'est possible qu'après 60 secondes, et 5 envois au plus par heure et par dossier ;
  - comparaison en temps constant ;
  - l'e-mail du code ne contient **que** le code et le prénom, avec le ton des mails de l'UL (tutoiement, pas de tiret cadratin).
- **Mode sur place** : le responsable connecté peut remplacer le code par une **vérification en présence** (case « J'ai vérifié l'identité de la personne », avec son nom). La méthode est enregistrée (`OTP_EMAIL` ou `IN_PERSON`) dans la preuve.
- **Tracé** :
  - un canevas à pointeur (doigt, stylet ou souris), avec les boutons « Effacer » et « Valider » ;
  - un tracé vide ou trop court est refusé ;
  - le tracé est enregistré en PNG (fond transparent, taille bornée) dans le stockage, sous une clé aléatoire (`Signature.imageKey`).
  - Il doit être utilisable au clavier et avec un lecteur d'écran : propose aussi la saisie du nom complet comme signature, avec une police manuscrite, pour l'accessibilité.
- **Preuve** (`Signature`) :
  - qui (nom, rôle : `VOLUNTEER`, `PARENT` ou `CRF_REPRESENTATIVE`) ;
  - quand (horodatage serveur) ;
  - la méthode (code par e-mail ou en présence) et l'e-mail vérifié ;
  - le navigateur ;
  - l'empreinte de l'IP ;
  - les empreintes SHA-256 de chaque PDF final (`documentHashes`).

  Un document « **Preuve de signature** » (PDF d'une page, généré par Binivol) récapitule ces éléments pour les 3 documents. Il est rangé avec la copie UL.

- **Modèles intègres** : l'empreinte SHA-256 de chaque modèle de `assets/modeles/` est figée dans le code. Au démarrage, ou à la génération, un modèle modifié bloque la génération avec un message clair.
- **Aplatissement** : les PDF finaux n'ont plus de champs modifiables.
- **Rien n'est régénéré en silence** : tout nouveau document crée une nouvelle version, et l'ancienne est archivée, jamais effacée.
- Les données personnelles des PDF passent par le module sensible (lecture journalisée côté responsable), et rien de sensible n'est écrit dans les journaux techniques.

### Remplissage des PDF

- Bibliothèque : `pdf-lib` (et `@pdf-lib/fontkit`). Embarque une **police Unicode** (par exemple Geist ou une police libre équivalente), pour que tous les noms s'affichent : accents, cédilles, caractères d'Europe de l'Est.
- **Correspondance** dans `src/server/pdf/mappings.ts` : un objet par modèle, nom exact du champ vers valeur. Les cases à cocher valent `/Oui` ou `/Off`.
- Un test charge chaque modèle et vérifie que **chaque champ de la correspondance existe**, et qu'aucun champ du modèle n'est oublié sans être noté « volontairement vide ».
- **Charte : attribution des champs à vérifier sur le PDF.** Remplis chaque champ avec son propre nom, convertis les pages en PNG (`pdftoppm` ou équivalent), regarde les images et déduis qui va où :
  - `Nom` / `Prénom` ;
  - `Nom_2` / `Prénom_2` / `Qualité` ;
  - `Nom_3` / `Prénom_3` ;
  - `nom / qualité` ;
  - `numéro de téléphone` ;
  - `Signature`, `Signature 01`, `Signature parent`.

  Mets les images de vérification dans `docs/captures/pdf-champs-*.png` et explique ta lecture dans `docs/dossier.md`.

- **Signatures** : les champs de signature sont des champs texte. Pose l'image PNG du tracé dans le **rectangle du champ** (widget), en gardant les proportions, puis supprime ou aplatis le champ. Ajoute sous l'image une ligne « Signé électroniquement le JJ/MM/AAAA ».
- **Dates** : `Jour`, `Mois`, `Année` (et les variantes de naissance et de signature) en `JJ`, `MM`, `AAAA`, au fuseau de Paris. « Fait à » : le paramètre `UL_CITY` (« Versailles »).
- **Structure** : le paramètre `UL_NAME`.
- **Attestation d'aptitude** : le NIVOL n'existe pas encore à ce stade. Le champ `NIVOL` reste **vide**, et c'est l'étape 9 qui le complétera. Documente-le.
- **Nomenclature** :
  - `NOM_Prénom_Dossier-Bénévole.pdf`
  - `NOM_Prénom_Charte-du-Bénévolat.pdf`
  - `NOM_Prénom_Attestation-d_Aptitude.pdf`

  Le NOM est en majuscules et le Prénom avec une majuscule initiale. Les accents sont gardés, les espaces deviennent `-`, et les caractères interdits sont retirés. Côté téléchargement, utilise `Content-Disposition` avec `filename*` (RFC 5987). Fonction pure, testée.

- **Copies** :
  - **copie UL** : les 3 PDF finaux et la preuve de signature, rangés dans le stockage comme `Document` de types `DOSSIER`, `CHARTE`, `APTITUDE` et `OTHER` (preuve), de copie `UL` ;
  - **copie bénévole** : les 3 PDF envoyés en pièces jointes. Ils ne sont **pas stockés une seconde fois**, mais leur empreinte est gardée dans la preuve.

### Contresignature

- Dans l'onglet Intégration, bloc « Dossier », un état « À contresigner » apparaît quand le candidat (et le parent) ont signé.
- Le responsable (`dossier.manage`) voit un aperçu de la charte, puis trace sa signature (ou saisit son nom). Sa session Google tient lieu de vérification : pas de code. Son nom et sa qualité (par défaut, le libellé de son profil, modifiable) sont remplis dans les champs prévus.
- Ensuite, en une suite d'opérations **reprise proprement en cas d'échec** :
  1. génération finale ;
  2. rangement dans le stockage ;
  3. écriture de la preuve et des `Document` ;
  4. e-mail au bénévole ;
  5. passage de la candidature en `GAIA`.

  Si l'e-mail échoue, les documents sont quand même rangés, et un bouton « Renvoyer l'e-mail » apparaît. Si le stockage échoue, rien n'est marqué signé côté UL et le message est clair.

### E-mail au bénévole

- Tutoiement, chaleureux, sans tiret cadratin, signé de l'unité locale. Il dit que le dossier est complet, ce qui va se passer ensuite (création du compte Croix-Rouge et du NIVOL), et il cite les pièces jointes.
- Pièces jointes : les 3 PDF finaux, plus `Règlement du bénévolat.pdf` et `Code de conduite (déc. 2024).pdf`.
- Pour un mineur, l'e-mail part au bénévole **et** au représentant légal.
- Le texte est stocké dans `Setting`, modifiable plus tard. Pilote `log` en démo (les pièces jointes sont listées par nom et taille dans `/admin/courriels`).

### Écrans

- **Candidat**, après « Envoyer » :
  1. l'écran « Signature », qui récapitule les 3 documents et propose un aperçu PDF de chaque document **avant signature**, généré à la volée et jamais stocké ;
  2. le tracé ;
  3. le code ;
  4. la confirmation.

  Pour un mineur, un écran « Au tour de ton représentant légal » suit, avec son propre tracé et le code envoyé sur **son** e-mail.

- **Responsable** :
  - le bloc « Dossier » montre les états : envoyé, signé par le bénévole, signé par le parent, à contresigner, complet, e-mail envoyé ou en échec ;
  - le bouton « Contresigner » ;
  - dans l'onglet Documents, les PDF finaux et la preuve (téléchargement journalisé, comme à l'étape 5).
- DA de l'étape 1, mobile d'abord pour le candidat, axe sans violation.

### Gestion des erreurs et cas limites à couvrir

- Code faux 5 fois : le défi est bloqué, et il faut en demander un nouveau. Code expiré : message clair. Demandes de code trop rapprochées : refusées avec le délai restant.
- Tracé vide : refusé.
- Modèle PDF modifié (empreinte différente) : génération bloquée, message clair à TOPAZE.
- Nom avec caractères spéciaux (ex. « Łucja Ñúñez-O'Brien ») : rendu correct dans les 3 PDF et dans le nom de fichier.
- Valeur trop longue pour un champ : le texte est réduit (taille de police ajustée) ou coupé proprement, jamais débordant. Teste le cas.
- Mineur dont le représentant n'a pas signé : pas de contresignature possible.
- Stockage indisponible ou e-mail en échec : voir plus haut. La reprise ne double aucun document.
- Deux responsables qui contresignent en même temps : le second est refusé (contrôle d'état).
- Dossier envoyé mais jamais signé : la candidature reste en `FILE`, et la relance relève de l'étape 12.

### Seed

- Le seed de démonstration ajoute :
  - un dossier signé par le bénévole, à contresigner ;
  - un dossier complet (contresigné), dont les documents sont marqués `fileMissing` : le seed n'écrit pas dans le stockage ;
  - un mineur signé par le bénévole, en attente du parent.

### Tests attendus

- [ ] Vitest (sans base) :
  - code : génération, empreinte, expiration, essais, délai entre deux envois, comparaison ;
  - nomenclature des fichiers et `filename*` ;
  - correspondances complètes pour les 3 modèles, avec les noms de champs exacts ;
  - dates découpées au fuseau de Paris ;
  - réduction des textes longs ;
  - empreinte des modèles ;
  - e-mails : contenu, ton, aucune donnée sensible dans l'e-mail du code ;
  - tests de 0.2 à 0.6.
- [ ] `test:db` :
  - parcours complet : signature du candidat, du parent, contresignature, puis `Document` UL, preuve, `OutboundMail` avec 5 pièces jointes, candidature en `GAIA` ;
  - les PDF générés : **relis-les** avec `pdf-lib` pour vérifier qu'ils sont aplatis (aucun champ), que leur empreinte correspond à la preuve et que leurs textes contiennent les valeurs attendues ;
  - reprise après un échec de stockage ou d'e-mail, sans doublon ;
  - contrôle de concurrence ;
  - mode sur place avec vérification en présence ;
  - lien consommé seulement après signature (0.5).
- [ ] Playwright :
  - **sur mobile (390 px)**, le candidat ouvre le lien (avec `#`), signe au doigt (tracé simulé), récupère le code dans `/admin/courriels` (pilote `log`), le saisit, puis voit la confirmation ;
  - le responsable contresigne et télécharge la charte ;
  - le parcours d'un mineur avec le parent ;
  - l'alternative clavier (nom saisi) ;
  - axe sans violation sur chaque écran de signature et sur la contresignature.
- [ ] CI verte. `pnpm verify`, `pnpm test:db` et `pnpm test:e2e` verts.

### Documentation

- [ ] `docs/signature.md` :
  - le parcours ;
  - les méthodes (code, en présence) ;
  - le contenu de la preuve ;
  - la **valeur juridique, en termes honnêtes** : signature électronique simple au sens d'eIDAS, faisceau de preuves, ce que ça couvre et ce que ça ne couvre pas ;
  - la conservation.
- [ ] `docs/dossier.md` : la correspondance finale de chaque champ PDF, la lecture de la charte (images à l'appui) et le NIVOL laissé vide jusqu'à l'étape 9.
- [ ] ADR : `pdf-lib` et l'aplatissement, la police Unicode, l'empreinte des modèles, la copie bénévole non stockée, le jeton après `#`, le lien consommé à la signature, le seed de la démo hébergée.
- [ ] `docs/permissions.md` régénéré si besoin ; README, `CLAUDE.md` et `.env.example` (`UL_NAME`, `UL_CITY`, clé HMAC du code) mis à jour.
- [ ] Captures : les écrans de signature à 390 px, la contresignature, et les 3 PDF finaux du seed rendus en image.

### Vérification de fin d'étape

1. `pnpm db:fresh`, puis en local avec le pilote `local` : parcours complet d'un candidat majeur, puis d'un mineur. Ouvre les 3 PDF générés : ils sont lisibles, signés, non modifiables, et les noms de fichiers sont corrects.
2. `sha256sum` des PDF téléchargés : identique aux empreintes de la preuve.
3. Sur la démo hébergée, après le déploiement de production : le seed s'est exécuté (0.2) et les dossiers de démonstration apparaissent. Sans stockage S3, la contresignature affiche le message clair attendu.
4. `pnpm verify`, `pnpm test:db` et `pnpm test:e2e` verts ; CI verte ; `main` avancé ; commits Conventional poussés.
5. Vérifie que chaque fichier annoncé existe vraiment.

### Récapitulatif demandé

À la fin, donne-moi :

- comment `main` a été mis à jour, et l'état de la production ;
- les migrations ajoutées ;
- la lecture des champs de la charte (qui va où), avec les images ;
- le test instable trouvé et sa cause (0.4) ;
- le résultat de chaque commande (nombre de tests), l'état de la CI et la liste des tests e2e ignorés avec leur raison ;
- la sortie de `git ls-files docs/ assets/` ;
- les captures (ou descriptions) ;
- les écarts par rapport à ce prompt, chacun justifié ;
- les points à vérifier ou à trancher de mon côté.
