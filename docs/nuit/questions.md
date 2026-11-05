# Questions de la nuit : choix faits seul, à confirmer

Chaque point : la question, le choix fait, comment le changer.

## Étape 8 — Signature et PDF

1. **Tutoiement ou vouvoiement du candidat ?** Le formulaire de l'étape 7 vouvoie ; le cahier de
   l'étape 8 demande le tutoiement pour les e-mails et nomme l'écran « Au tour de ton
   représentant légal ». **Choix** : les écrans de signature et les e-mails de signature
   tutoient ; le formulaire garde le vouvoiement. **Pour changer** : textes de
   `src/components/signature/*.tsx` et `src/server/mail/templates.ts`.
2. **Qualité du représentant CRF par défaut.** **Choix** : le libellé du profil
   (« DIAMANT · Animation des équipes », « TOPAZE · DLUS »), modifiable dans la boîte de
   contresignature. **Pour changer** : `defaultQuality()` dans `src/server/signature/service.ts`.
3. **Bloc « mineur de moins de 16 ans » de la charte.** Le titre du PDF dit « moins de 16 ans »,
   le cahier fait signer le représentant légal de tout mineur. **Choix** : rempli pour tout
   mineur (moins de 18 ans).
4. **`nom / qualité` et `numéro de téléphone` de la charte** : la lecture du PDF montre la
   **personne à contacter en cas d'urgence** (et non le représentant légal, comme supposé à
   l'étape 7). **Choix** : « Prénom Nom / lien de parenté » et son premier téléphone.
5. **`Prénom - 2` du dossier** : c'est la ligne « Prénom* » de la page 2 (pas le second prénom).
   **Choix** : prénom suivi du second prénom. **`Nom de naissance`** (obligatoire sur le PDF) :
   le nom de naissance, à défaut le nom.
6. **Date du bas de l'attestation** : le modèle réutilise les champs de date de naissance.
   **Choix** : Binivol y écrit la date de signature, sans modifier le modèle (empreinte figée).
   Un modèle corrigé par la Croix-Rouge demandera de mettre à jour l'empreinte et la
   correspondance.
7. **Passage à GAIA si l'e-mail échoue.** **Choix** : la candidature passe à `GAIA` dès la
   contresignature (le dossier est complet côté UL) ; l'échec de l'e-mail reste visible avec
   « Renvoyer l'e-mail » (ADR-046).
8. **Délai de 60 s entre deux codes** : appliqué **par signataire** (le représentant légal peut
   demander son code juste après le mineur) ; le plafond de 5 codes par heure reste **par
   dossier**.
9. **Démo hébergée sans S3** : la signature est refusée dès l'écran avec un message clair (le
   tracé doit être stocké). **Pour tester la signature en ligne** : configurer un compartiment
   S3 privé (Supabase Storage) et `STORAGE_DRIVER=s3` dans Vercel (`docs/storage.md`).
10. **Police manuscrite du nom saisi** : Caveat (OFL), embarquée dans `assets/fonts/` ; police
    des PDF : Geist (OFL, déjà utilisée par l'interface).
11. **Paramètres du seed de base** : `seed:base` ne crée plus que les paramètres manquants (il
    écrasait les valeurs à chaque déploiement). Conséquence : une valeur par défaut changée dans
    le code ne s'applique plus à une base existante ; elle se change dans les paramètres
    (étape 14).
