<!-- Fichier généré par `pnpm docs:permissions` depuis src/server/policy/matrix.ts. Ne pas modifier à la main. -->

# Droits d'accès

Toutes les règles sont appliquées par `can()` (`src/server/policy/can.ts`), fonction pure, à partir de la matrice `src/server/policy/matrix.ts`. Les profils se cumulent : un compte a l'union des droits de ses profils.

## Profils

- **TOPAZE** : TOPAZE · DLUS
- **ACTION** : ACTION · Missions de secours
- **LASER** : LASER · Urgence
- **FORMAT** : FORMAT · Formation interne
- **FORMAT_GP** : FORMAT GP · Formation grand public
- **DIAMANT** : DIAMANT · Animation des équipes

## Matrice

| Action | Porte sur | TOPAZE | ACTION | LASER | FORMAT | FORMAT_GP | DIAMANT |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Consulter l'annuaire (nom, NIVOL, statut, e-mail, téléphone) (`person.directory.read`) | une personne | Oui | Oui, sauf candidat ou personne archivée | Oui, sauf candidat ou personne archivée | Oui, sauf candidat ou personne archivée | Oui, sauf candidat ou personne archivée | Oui, sauf personne archivée |
| Consulter la fiche complète (hors données sensibles) (`person.full.read`) | une personne | Oui | Si la personne relève du profil | Si la personne relève du profil | — | Si la personne relève du profil | Si la personne relève du profil |
| Consulter les données sensibles (naissance, adresse, personnes à prévenir, B3, autorisation parentale) (`person.sensitive.read`) | une personne | Oui | Si la personne relève du profil | Si la personne relève du profil | — | Si la personne relève du profil | Si la personne relève du profil |
| Modifier l'identité et les coordonnées (`person.update`) | une personne | Oui | — | — | — | — | Si la personne relève du profil |
| Changer le statut d'une personne (`person.status.change`) | une personne | Oui | — | — | — | — | — |
| Enregistrer le retour d'un ancien bénévole (`person.return`) | une personne | Oui | — | — | — | — | Oui, sauf personne archivée |
| Enregistrer la vérification du B3 et en voir l'issue (`b3.manage`) | une personne | Oui | — | — | — | — | — |
| Corriger le NIVOL (motif obligatoire) (`person.nivol.correct`) | une personne | Oui | — | — | — | — | — |
| Consulter les formations suivies et les souhaits (`training.read`) | une personne | Oui | Si la personne relève du profil | Si la personne relève du profil | Oui, sauf candidat ou personne archivée | Si la personne relève du profil | Si la personne relève du profil |
| Saisir et modifier les formations suivies (`training.write`) | une personne | Oui | — | — | Oui, sauf candidat ou personne archivée | — | — |
| Gérer les sessions de formation (`trainingSession.manage`) | — | Oui | — | — | Oui | — | — |
| Gérer les souhaits de formation (`trainingWish.manage`) | une personne | Oui | — | — | Oui, sauf candidat ou personne archivée | — | — |
| Consulter les nominations (`appointment.read`) | une personne | Oui | Si la personne relève du profil | Si la personne relève du profil | — | Si la personne relève du profil | Si la personne relève du profil |
| Nommer à une fonction ou annuler une nomination (`appointment.write`) | une personne et une fonction | Oui | Si la fonction lui est confiée et que la personne relève du profil | Si la fonction lui est confiée et que la personne relève du profil | — | Si la fonction lui est confiée et que la personne relève du profil | — |
| Gérer les candidatures (`candidacy.manage`) | une personne | Oui | — | — | — | — | Si la personne relève du profil |
| Créer un candidat ou réengager une personne (`candidacy.create`) | — | Oui | — | — | — | — | Oui |
| Annuler une intégration finalisée par erreur (7 jours) (`candidacy.finalize.undo`) | une personne | Oui | — | — | — | — | — |
| Gérer les dossiers en ligne (`dossier.manage`) | une personne | Oui | — | — | — | — | Si la personne relève du profil |
| Gérer les parrainages (`mentorship.manage`) | une personne | Oui | — | — | — | — | Si la personne relève du profil |
| Gérer les points de suivi (`followUp.manage`) | une personne | Oui | — | — | — | — | Si la personne relève du profil |
| Consulter les documents (`document.read`) | une personne | Oui | Si la personne relève du profil | Si la personne relève du profil | — | Si la personne relève du profil | Si la personne relève du profil |
| Déposer et archiver des documents (`document.upload`) | une personne | Oui | — | — | — | — | Si la personne relève du profil |
| Consulter les documents archivés (`document.archived.read`) | une personne | Oui | — | — | — | — | — |
| Gérer les comptes et leurs profils (`user.manage`) | — | Oui | — | — | — | — | — |
| Gérer le référentiel des formations et fonctions (`reference.manage`) | — | Oui | — | — | Oui | — | — |
| Gérer les paramètres (`setting.manage`) | — | Oui | — | — | — | — | — |
| Gérer les règles de rappel (`reminderRule.manage`) | — | Oui | — | — | — | — | — |
| Consulter le journal d'audit (`audit.read`) | — | Oui | — | — | — | — | — |
| Consulter le journal des consultations sensibles (`accessLog.read`) | — | Oui | — | — | — | — | — |
| Exporter les données des personnes (`person.export`) | — | Oui | — | — | — | — | — |
| Importer l'ancien classeur (`import.run`) | — | Oui | — | — | — | — | — |
| Consulter les e-mails du pilote de démonstration (`mail.log.read`) | — | Oui | — | — | — | — | — |
| Consulter ses notifications (`notification.readOwn`) | — | Oui | Oui | Oui | Oui | Oui | Oui |
| Voir les alertes formations et nominations d'une personne (`alert.training.read`) | une personne | Oui | Si la personne relève du profil | Si la personne relève du profil | Oui, sauf candidat ou personne archivée | Si la personne relève du profil | — |
| Voir les alertes d'intégration et de suivi d'une personne (relances, points, pauses, fiche) (`alert.integration.read`) | une personne | Oui | — | — | — | — | Si la personne relève du profil |
| Voir les alertes réservées à TOPAZE (B3, purge, NIVOL, référentiel) (`alert.admin.read`) | une personne | Oui | — | — | — | — | — |
| Exporter la matrice des compétences (personnes de son périmètre) (`training.matrix.export`) | — | Oui | Oui | Oui | Oui | Oui | — |

## Fiche d'une personne

- **Fiche complète** avec `person.full.read` : chaque onglet selon les autres droits (formations, fonctions, suivi, documents…).
- **Fiche réduite** avec `training.read` sans `person.full.read` (FORMAT) : un en-tête limité aux champs de l'annuaire (nom, NIVOL, statut, périmètres, « Formateur ») et le seul onglet Formations. Ni bloc sensible, ni action.
- **403** : la personne est visible dans l'annuaire, mais aucune des deux fiches n'est permise.
- **404** : la personne n'est pas visible dans l'annuaire du compte (un candidat pour ACTION, par exemple). Son existence n'est pas révélée.

## Lexique

- **Relève du profil** : une personne archivée ne relève de personne. Elle relève d'ACTION, LASER ou FORMAT GP quand elle n'est pas candidate et que son périmètre contient celui du profil : formations validées et non expirées, nominations actives et case « Formateur » (FORMAT GP), selon `reference_items.perimeters`. Elle relève de DIAMANT quand elle est dans le périmètre DIAMANT. Personne ne relève de TOPAZE ni de FORMAT, qui ont des droits globaux.
- **Périmètre DIAMANT** : statut Candidat, ou une candidature ouverte, ou une date d'entrée de moins de `NEW_VOLUNTEER_MONTHS` mois (paramètre, 12 par défaut), ou un parrainage en cours comme filleul.
- **Fonction confiée** : le profil figure dans `reference_items.managed_by` de la fonction (répartition par défaut, à confirmer : CHEF_PAPS et CDPE → ACTION ; CI et CI_SDIS → LASER ; CH_TECH, CH_FIXE, CH_MOBILE, CH_RESEAUX → ACTION et LASER ; ASSIST_FORM → FORMAT GP).
- **Données sensibles** : naissance, adresse, personnes à prévenir, B3, autorisation parentale et documents. Elles ne se lisent que par `src/server/sensitive.ts`, qui journalise chaque consultation dans `access_logs`.
