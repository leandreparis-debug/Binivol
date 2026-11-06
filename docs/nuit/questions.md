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

## Étape 11 — Suivi

9. **Liste des points dans `/candidats/suivi`** (pas de nouvelle entrée `/suivi` dans la
   navigation) : mêmes responsables que les candidats (DIAMANT, TOPAZE). **Pour une entrée
   dédiée** : déplacer la page sous `src/app/(app)/suivi/` et l'ajouter à `NAV_ITEMS`.
10. **Compte rendu de suivi non sensible** (ADR-055), jamais dans une liste. **Pour le rendre
    sensible** : le déplacer dans `PersonSensitive` (migration) et le lire par `sensitive.ts`.
11. **B3 saisi par TOPAZE seul** (`b3.manage`), issue `FLAGGED` visible par TOPAZE seul.
    **Pour l'ouvrir à DIAMANT** : ajouter DIAMANT à `b3.manage` dans `matrix.ts` (et
    `visibility.ts` si une liste en dépend), puis `pnpm docs:permissions`.
12. **Retour d'un ancien** : TOPAZE par « Changer le statut », DIAMANT par le bouton dédié
    « Retour d'un ancien » (`person.return`), motif obligatoire dans les deux cas.
13. **Départ** : les points de suivi prévus ne sont pas annulés (la liste n'affiche que les
    personnes actives ou en pause, et un retour les retrouve). **Pour les annuler** : ajouter
    une case « Annuler les points prévus » au départ.

## Étape 12 — Alertes, rappels, e-mails

14. **`/alertes` est rangée sous « Rappels »** (pilules Rappels / Alertes), sans nouvelle entrée
    dans la barre du bas (5 entrées au plus sur mobile). **Pour une entrée dédiée** : l'ajouter
    à `NAV_ITEMS` et retirer l'alias de `NavPills.tsx`.
15. **E-mails d'anniversaire désactivés par défaut** (`GREETING_EMAILS_ENABLED=false`). La base
    hébergée garde sa valeur actuelle (le seed n'écrase pas un paramètre existant) et l'import
    du classeur reprend `MAILS_VOEUX_ACTIFS`. **Pour les couper** : `/admin/reglages`.
16. **RGPD** : l'information donnée aux bénévoles (notice du dossier, `RGPD_NOTICE`) doit
    mentionner les e-mails d'anniversaire et le droit de s'y opposer (case « Ne pas recevoir les
    messages d'anniversaire » de la fiche). À faire valider par le DPO.
17. **Adresse d'envoi** : le cahier parle de `MAIL_FROM` ; la variable existante est
    `SMTP_FROM`, réutilisée (pas de seconde variable).
18. **« Récapitulatif TCAU »** : bouton réservé à TOPAZE et FORMAT (`trainingSession.manage`) ;
    il liste les présents que l'expéditeur voit.
19. **Démo seulement** : la fonction `CH_RESEAUX` est désactivée et `F_CI` exige `TCAU`, pour
    que chaque règle d'alerte ait un cas. Rien de tel dans `db:seed:base`.
20. **« Activité »** (sans activité depuis 6 mois) : session de formation, début d'une
    nomination ou point de suivi fait.
21. **Délais par défaut** des rappels (7 j, 5 j, B3 en janvier) : la migration ne les change
    sur la base hébergée que s'ils avaient encore les valeurs de l'étape 2.

## Étape 13 — Tableaux de bord, exports

22. **Export préfecture** : bénévoles **actifs** seulement (pas en pause), une ligne par
    formation valide de `PREFECTURE_CODES` (PSE, FPSE). **Pour changer** : le paramètre
    `PREFECTURE_CODES`, ou le filtre de statut dans `src/server/services/exports.ts`.
23. **Export de l'annuaire réservé à TOPAZE** (`person.export`), celui de la matrice ouvert aux
    profils qui voient la matrice (`training.matrix.export`, sauf DIAMANT). **Pour élargir** :
    la matrice des droits (`matrix.ts`), puis `pnpm docs:permissions`.
24. **« Équipiers disponibles »** (ACTION) : bénévoles **actifs** du périmètre (ni en pause, ni
    suspendus).
