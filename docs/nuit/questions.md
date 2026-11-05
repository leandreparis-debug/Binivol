# Questions de la nuit : choix faits seul, à confirmer

Chaque point : la question, le choix fait, comment le changer.

## Organisation de la nuit

1. **Deux étapes 8.** Une session parallèle (branche `claude/quirky-johnson-9av6kd`) a livré
   l'étape 8 sur `main` pendant que cette session faisait la sienne. **Choix** : adopter celle de
   `main` (déployée) comme base des étapes suivantes, sans rien forcer ; l'autre version reste
   dans l'historique de `claude/binivol-v1-marathon-nuit-7yijue` (`327d40d` à `b9c313f`). **Pour
   comparer** : `git diff 29e4618 b9c313f`.

## Étape 9 — Gaia

2. **Pas de copie de diplôme** (ADR-049) : réversible en remettant `DIPLOMA_COPY` dans
   `DOSSIER_ATTACHMENT_KINDS` et en le retirant de `RETIRED_DOCUMENT_KINDS`
   (`src/lib/dossierForms.ts`).
3. **Nationalité** : le dossier ne la recueille pas ; la fiche Gaia affiche « À demander ».
   **Pour la recueillir** : ajouter un champ au dossier (version 3 du schéma) et à la fiche.
4. **« Adhésion enregistrée »** n'apparaît que si la personne a un document « Bulletin
   d'adhésion ». **Pour la montrer toujours** : retirer `onlyIfAdhesion` du paramètre
   `GAIA_CHECKLIST`.
5. **Unicité de l'e-mail CRF** : contrôlée par le service (sans casse), pas par un index unique
   (une base existante avec des doublons aurait bloqué la migration au déploiement). **Pour
   durcir** : index unique sur `lower(crf_email)` après nettoyage.
6. **Annulation d'une clôture** : la fiche redevient « Candidat » même pour une personne
   réengagée (son ancien départ n'est pas restauré : la clôture l'avait effacé).
7. **Seed** : un seul candidat à « Création Gaia » (liste à moitié cochée) ; pas de second
   candidat à liste vide, pour ne pas changer les comptes de l'annuaire vérifiés par les tests.
   Une clôture datée d'il y a 2 jours montre « Annuler la clôture » à TOPAZE.
8. **`seed:base`** ne crée plus que les paramètres manquants (il les écrasait à chaque
   déploiement) : une valeur par défaut changée dans le code ne s'applique plus à une base
   existante ; elle se change dans les paramètres (étape 14).
