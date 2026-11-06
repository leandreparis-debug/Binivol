# RGPD : registre, droits des personnes, purge (étape 14)

> **BROUILLON à faire valider par le DPO de la Croix-Rouge française avant toute utilisation
> réelle.** Ce document décrit ce que fait Binivol ; il ne remplace pas le registre officiel
> de l'association.

## Registre de traitement (brouillon)

| Rubrique               | Contenu                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Responsable            | Croix-Rouge française, unité locale de Versailles (par délégation).                                                                                                                                                                                                                                                    |
| Finalités              | Recrutement et intégration des bénévoles ; suivi des formations, compétences et nominations ; organisation des missions ; points de suivi et parrainage ; obligations (export préfecture, vérification du B3 pour l'encadrement de mineurs).                                                                           |
| Base légale            | Intérêt légitime de l'association et engagement bénévole (mesures précontractuelles pour les candidats) ; obligation légale pour le B3 et l'export préfecture ; consentement pour les e-mails d'anniversaire (opposition possible à tout moment).                                                                      |
| Personnes concernées   | Candidats, bénévoles, anciens bénévoles, personnes à prévenir.                                                                                                                                                                                                                                                         |
| Catégories de données  | Identité, coordonnées, NIVOL, parcours (formations, nominations, suivi) ; **données sensibles** séparées (`PersonSensitive`, contacts d'urgence, documents) : naissance, adresse, vérification du B3 (date et issue, **jamais de copie du casier**), autorisation parentale.                                           |
| Destinataires          | Les responsables de l'UL selon leur profil (`docs/permissions.md`) ; le pôle Urgence (prévenance TCAU, noms seulement) ; la préfecture (export annuel, après vérification dans Pegass).                                                                                                                                |
| Durées de conservation | Bénévole parti : `RETENTION_YEARS_AFTER_LEAVE` ans après le départ (5 par défaut) ; candidature abandonnée : `ABANDONED_RETENTION_MONTHS` mois (12) ; journaux : anonymisés à la purge de la personne, conservés sinon.                                                                                                |
| Mesures de sécurité    | Connexion Google @croix-rouge.fr des seuls responsables ; droits par profil (politique unique, testée) ; données sensibles lues à la demande et **journalisées** ; fichiers jamais publics ; journaux en ajout seul (déclencheur) ; sauvegardes chiffrées (AES-256-GCM) ; hébergement en France (`cdg1`, `eu-west-3`). |
| Transferts hors UE     | Aucun prévu (à confirmer selon l'hébergeur retenu).                                                                                                                                                                                                                                                                    |

L'information des personnes est le paramètre `RGPD_NOTICE`, affiché dans le dossier en ligne
et sur la page publique **`/confidentialite`** (liée depuis le dossier). Elle doit mentionner
les e-mails d'anniversaire et le droit de s'y opposer.

## Droits des personnes

| Droit                      | Comment                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accès, portabilité         | TOPAZE, fiche de la personne : « Exporter les données (RGPD) ». Une archive ZIP : `donnees.json` (tout, données sensibles comprises, commenté), `resume.pdf` (lisible) et les documents stockés. Journalisé (« export RGPD »). Sans stockage (démo), l'archive liste les fichiers absents.                                                                                                                           |
| Rectification              | Par la fiche (« Modifier »), tracé dans le journal d'audit.                                                                                                                                                                                                                                                                                                                                                          |
| Opposition (anniversaires) | Case « Ne pas recevoir les messages d'anniversaire » de la fiche.                                                                                                                                                                                                                                                                                                                                                    |
| Opposition, effacement     | **Qui décide** : TOPAZE, sur demande écrite de la personne, après avis du DPO si besoin. **Comment** : `/admin/purge`, « Effacement anticipé » : référence, motif (gardé dans la trace), confirmation « PURGER ». **Ce qui doit rester** : ce qu'une obligation légale impose (par exemple une vérification du B3 encore requise, un litige en cours) ; dans ce cas, refuser l'effacement et répondre à la personne. |

## Purge

- **Éligibles** : personne partie dont `purgeEligibleAt` est passé ; candidat jamais devenu
  bénévole (ni date d'entrée ni NIVOL) dont toutes les candidatures sont abandonnées depuis plus
  de `ABANDONED_RETENTION_MONTHS` mois.
- **Mode** (`PURGE_MODE`) : `MANUAL` par défaut, la tâche quotidienne ne fait que prévenir
  TOPAZE (une notification par nouvelle liste) ; TOPAZE valide sur `/admin/purge` (liste, tout
  cocher, « PURGER »). `AUTOMATIC` : la tâche quotidienne purge seule.
- **Ce que fait la purge** (`src/server/services/purge.ts`), en une transaction par personne :
  1. les journaux qui la concernent sont **anonymisés** (pas supprimés) : dans `audit_logs`,
     l'identifiant de la personne et de toutes ses lignes (formations, candidatures, documents…)
     est remplacé par un pseudonyme aléatoire, les valeurs avant/après effacées ; dans
     `access_logs`, l'identifiant de la personne est remplacé et le contexte effacé ;
  2. la personne est **supprimée physiquement**, et tout ce qui en dépend par cascade (la seule
     suppression physique autorisée) ;
  3. une **trace minimale** est écrite : « 1 fiche purgée, par X, règle Y » (action `PURGE`,
     sans donnée personnelle) ;
  4. après la transaction, ses fichiers (documents, pièces jointes du dossier, images de
     signature) sont supprimés du stockage ; un fichier qui ne se supprime pas est gardé dans
     `storage_orphans` et retenté (bouton « Réessayer », et chaque jour).
- Les journaux sont en ajout seul : seule une transaction qui pose `SET LOCAL
binivol.allow_purge = 'on'` peut les modifier (ADR de l'étape 2) ; la purge est la seule.
- Testé : plus aucune ligne en base qui nomme la personne (toutes les tables ayant
  `person_id`, `mentee_id`, `mentor_id` ou `entity_id`), journaux cohérents, trace présente.

## Journaux

`/admin/journaux` (TOPAZE) : journal d'audit (période, auteur, type d'objet, personne, action)
et journal des consultations sensibles (période, utilisateur, personne, portée), paginés par le
serveur, valeurs sensibles masquées comme à l'écriture. Filtre « consultations répétées » :
5 lectures ou plus de la même personne par le même utilisateur en 24 h. Export CSV journalisé.
