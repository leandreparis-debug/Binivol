# Modèle de données

Source de vérité : `prisma/schema.prisma` et `prisma/migrations/`. Ce document en donne la
lecture métier. PostgreSQL standard (15 et 16), accès uniquement par Prisma 7 et l'adaptateur
`pg`, via la couche `src/server/`.

## Diagramme

```mermaid
erDiagram
  User ||--o{ UserProfile : "a les profils"
  User ||--o{ Account : "identité Google"
  User ||--o{ Session : "sessions en base"
  User ||--o{ Candidacy : "suit (owner)"
  User ||--o{ CandidacyEvent : "auteur"
  User ||--o{ FollowUp : "mène"
  User ||--o{ Document : "dépose"
  User ||--o{ DossierLink : "crée"
  User ||--o{ Notification : "reçoit"

  Person ||--o| PersonSensitive : "données sensibles"
  Person ||--o{ EmergencyContact : "personnes à prévenir"
  Person ||--o{ PersonSkill : ""
  Person ||--o{ PersonLanguage : ""
  Person ||--o{ PersonLicense : ""
  Person ||--o{ PersonDeclaredDiploma : ""
  Person ||--o{ PersonWishedActivity : ""
  Person ||--o{ PersonAnnex : ""
  Person ||--o{ TrainingRecord : "a suivi"
  Person ||--o{ TrainingWish : "souhaite"
  Person ||--o{ Appointment : "est nommé"
  Person ||--o{ Candidacy : "candidate"
  Person ||--o{ Mentorship : "filleul"
  Person ||--o{ Mentorship : "parrain"
  Person ||--o{ FollowUp : "points de suivi"
  Person ||--o{ DossierLink : "liens de dossier"
  Person ||--o{ DossierSubmission : "dossiers"
  Person ||--o{ Document : "documents"
  Person ||--o{ Notification : "concerne"

  ReferenceItem ||--o{ ReferenceItemPrerequisite : "exige"
  ReferenceItem ||--o{ ReferenceItemPrerequisite : "prérequis de"
  ReferenceItem ||--o{ TrainingSession : "sessions"
  ReferenceItem ||--o{ TrainingRecord : ""
  ReferenceItem ||--o{ TrainingWish : ""
  ReferenceItem ||--o{ Appointment : "fonction"
  TrainingSession |o--o{ TrainingRecord : ""
  TrainingSession |o--o{ TrainingWish : "session prévue"

  Candidacy ||--o{ CandidacyEvent : "historique"
  DossierLink |o--o{ DossierSubmission : ""
  DossierSubmission ||--o{ OtpChallenge : "codes"
  DossierSubmission ||--o{ Signature : "signatures"
  OtpChallenge |o--o| Signature : "valide"

  ReminderRule |o--o{ Notification : "produit"

  Person {
    text id PK
    text ref UK "P-00001"
    text nivol UK "11 chiffres + 1 lettre"
    enum status
    bool legacy_import
    timestamptz archived_at
    date purge_eligible_at
  }
  TrainingRecord {
    text ref UK "S-00001"
    enum result
    date date
    date expires_at "calculé par l'application"
    timestamptz cancelled_at
  }
  Appointment {
    text ref UK "F-00001"
    date start_date
    date end_date
    timestamptz cancelled_at
  }
  ReferenceItem {
    text code UK
    enum category
    enum kind
    int validity_months
    bool expires_end_of_year
    enum_array perimeters
  }
  AuditLog {
    timestamptz at
    text actor_id
    enum action
    text entity
    text field
    jsonb old_value
    jsonb new_value
  }
  AccessLog {
    timestamptz at
    text user_id
    text person_id
    enum scope
  }
  Setting {
    text key UK
    jsonb value
  }
```

`AuditLog`, `AccessLog` et `Setting` n'ont aucune relation : les journaux doivent survivre aux
entités qu'ils décrivent (voir plus bas).

## Règles transverses

- **Identifiants** : `id` en texte, cuid2 généré par Prisma. Les entités métier ont en plus un
  numéro lisible tiré d'une séquence Postgres par la fonction `binivol_next_ref()`, valeur par
  défaut de la colonne : `P-00001` (personne), `S-00001` (formation suivie), `F-00001`
  (nomination). Le numéro passe à 6 chiffres après 99 999 au lieu de se tronquer.
- **Dates** : `timestamptz` pour les instants, `date` pour les dates sans heure (naissance,
  obtention, échéance). Les `date` arrivent en JavaScript à 00:00 UTC ; `toParisDay()`
  (`src/lib/dates.ts`) donne « aujourd'hui à Paris » dans la même forme.
- **Pas de suppression physique** des données métier. On archive (`archivedAt`) ou on annule
  avec trace (`cancelledAt`, `cancelledById`, `cancelReason`). Seule la purge RGPD de l'étape 14
  supprimera, à partir de `Person.purgeEligibleAt`. Les tables filles d'une personne sont en
  `ON DELETE CASCADE` pour que cette purge soit une seule opération.
- **Colonnes d'acteur** : `createdAt`, `updatedAt`, `createdById`, `updatedById` sur toute table
  métier. Les deux derniers sont nullables (import, système) et **sans clé étrangère** : ils
  restent valides même pour un acteur technique, et le journal d'audit fait foi.
- **Journaux en ajout seul** : `audit_logs` et `access_logs` refusent `UPDATE`, `DELETE` et
  `TRUNCATE` (déclencheur au niveau instruction, donc même quand aucune ligne n'est visée), sauf
  dans une transaction qui exécute `SET LOCAL binivol.allow_purge = 'on'`. Seule la purge RGPD
  (et la remise à zéro des tests) utilisera ce contournement.
- **Jetons et codes hachés** : `DossierLink.tokenHash` et `OtpChallenge.codeHash` ne
  contiennent que l'empreinte SHA-256 ; `Signature.ipHash` remplace l'adresse IP. Le jeton en
  clair n'existe que dans le lien envoyé.
- **Audit** : `withAudit()` (`src/server/audit.ts`) écrit le différentiel champ par champ dans la
  même transaction que la modification et remplace les valeurs sensibles par `"[sensible]"`.
- **Recherche** : `binivol_normalize()` (SQL pur, `IMMUTABLE`, sans extension `unaccent`) rend
  la recherche insensible aux accents et à la casse ; utilisable dans un index d'expression.
- **Libellés** : chaque valeur d'énumération a son libellé français dans `src/lib/labels.ts`
  (vérifié par un test).

## Contraintes posées en SQL

Prisma ne sait pas les exprimer ; elles sont dans
`prisma/migrations/20261104090200_constraints_and_triggers` (et, pour `managed_by`,
`20261104102527_auth_sessions_and_legacy_fields`). Les index partiels, eux, sont
déclarés dans le schéma (fonctionnalité `partialIndexes` de Prisma 7), donc préservés par les
migrations futures.

| Nom                                                                  | Table                        | Règle                                                                   |
| -------------------------------------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `persons_nivol_format`                                               | persons                      | NIVOL nul ou `^[0-9]{11}[A-Z]$`                                         |
| `persons_nivol_required`                                             | persons                      | NIVOL obligatoire sauf CANDIDATE, LEFT, INACTIVE ou `legacy_import`     |
| `persons_left_requires_date`                                         | persons                      | `left_at` obligatoire si LEFT                                           |
| `persons_nivol_key` (unique)                                         | persons                      | un NIVOL par personne                                                   |
| `candidacies_one_open` (index partiel)                               | candidacies                  | une seule candidature avec `closed_at` nul par personne                 |
| `candidacies_closed_matches_stage`                                   | candidacies                  | close si et seulement si DONE ou ABANDONED                              |
| `training_wishes_one_open` (partiel)                                 | training_wishes              | un seul souhait OPEN, WAITLISTED ou SCHEDULED par personne et référence |
| `mentorships_not_self`                                               | mentorships                  | pas de parrainage de soi-même                                           |
| `mentorships_dates`, `appointments_dates`, `training_sessions_dates` | —                            | fin ≥ début                                                             |
| `appointments_reference_is_function`                                 | appointments (déclencheur)   | une nomination porte sur une référence de type FUNCTION                 |
| `reference_items_validity_positive`                                  | reference_items              | validité > 0 mois                                                       |
| `reference_item_prerequisites_not_self`                              | reference_item_prerequisites | une référence n'est pas son propre prérequis                            |
| `training_sessions_capacity_positive`                                | training_sessions            | capacité > 0                                                            |
| `documents_size_positive`, `documents_sha256_format`                 | documents                    | taille ≥ 0, SHA-256 en hexadécimal minuscule                            |
| `otp_challenges_attempts_positive`                                   | otp_challenges               | tentatives ≥ 0                                                          |
| `users_email_lowercase`                                              | users                        | e-mail stocké en minuscules                                             |
| `reference_items_managed_by_functions_only`                          | reference_items              | `managed_by` vide pour une formation (étape 3)                          |
| `audit_logs_append_only`, `access_logs_append_only`                  | journaux (déclencheurs)      | ajout seul                                                              |

Les violations connues sont traduites en `DomainError` avec un message français par
`translateDbError()` (`src/server/errors.ts`).

**Attention pour les migrations futures** : le texte d'un index partiel doit être écrit comme
PostgreSQL le restitue (`status = ANY (ARRAY[...])` plutôt que `status IN (...)`), sinon Prisma
le recrée à chaque migration. Toujours relire le SQL produit par `pnpm db:migrate --create-only`.

## Tables

Sensibilité : **N** normale, **S** sensible (accès filtré à l'étape 3, journalisé dans
`access_logs`, valeurs masquées dans l'audit).

### Comptes

| Table           | Rôle                                             | Champs clés                                                      | Sens. |
| --------------- | ------------------------------------------------ | ---------------------------------------------------------------- | ----- |
| `users`         | Responsable qui se connecte                      | `email` unique en minuscules, `active`, `last_login_at`          | N     |
| `user_profiles` | Profils cumulables d'un responsable              | `(user_id, profile)` unique                                      | N     |
| `accounts`      | Identité Google liée à un compte (Auth.js)       | `(provider, provider_account_id)` unique ; **aucun jeton OAuth** | N     |
| `sessions`      | Sessions en base (Auth.js, stratégie `database`) | `session_token` unique (cookie HttpOnly), `expires`              | N     |

Les bénévoles n'ont pas de compte. `accounts` et `sessions` sont des données techniques :
une session est supprimée à la déconnexion et à la désactivation du compte. Un compte n'est
jamais supprimé, seulement désactivé.

### Personnes

| Table                      | Rôle                                                                                                                                                                                | Champs clés                                                                                                         | Sens. |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----- |
| `persons`                  | Candidat **et** bénévole (un seul modèle) ; `is_trainer` (colonne « Formateur », nul = inconnu, vrai → périmètre FORMAT_GP) et `legacy_drive_folder_id` (colonne « Dossier Drive ») | `ref`, `nivol`, identité, contacts, `status`, départ, aptitude, `legacy_import`, `archived_at`, `purge_eligible_at` | N     |
| `person_sensitive`         | Naissance, adresse, B3, autorisation parentale (1–1)                                                                                                                                | `person_id` unique                                                                                                  | S     |
| `emergency_contacts`       | Personnes à prévenir, ordonnées (`position`)                                                                                                                                        | civilité, nom, lien, adresse, 2 téléphones, e-mail                                                                  | S     |
| `person_skills`            | Compétences et niveau                                                                                                                                                               | `label`, `level`                                                                                                    | N     |
| `person_languages`         | Langues et niveau                                                                                                                                                                   | `label`, `level`                                                                                                    | N     |
| `person_licenses`          | Permis de conduire                                                                                                                                                                  | `(person_id, category)` unique                                                                                      | N     |
| `person_declared_diplomas` | Diplômes déclarés dans le dossier (texte libre)                                                                                                                                     | `label`                                                                                                             | N     |
| `person_wished_activities` | Activités souhaitées (texte libre)                                                                                                                                                  | `label`                                                                                                             | N     |
| `person_annexes`           | Compétences annexes (conducteur VPSP…)                                                                                                                                              | `code`, `valid_until`                                                                                               | N     |

### Référentiel, formations, nominations

| Table                          | Rôle                                                      | Champs clés                                                                                                                             | Sens. |
| ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `reference_items`              | Formations et fonctions (21 codes du classeur + 3 ajouts) | `code` unique, `category`, `kind`, `validity_months`, `expires_end_of_year`, `forbidden_for_minors`, **`perimeters`**, **`managed_by`** | N     |
| `reference_item_prerequisites` | Prérequis (n–n réflexive)                                 | `(item_id, prerequisite_id)`                                                                                                            | N     |
| `training_sessions`            | Session organisée                                         | dates, lieu, `pegass_url`, capacité, annulation                                                                                         | N     |
| `training_records`             | Formation suivie (feuille « Sessions »)                   | `ref` S-, `result`, `date` (souvent inconnue), `expires_at` calculé, annulation                                                         | N     |
| `training_wishes`              | Souhait de formation                                      | `status`, `priority`, session prévue                                                                                                    | N     |
| `appointments`                 | Nomination à une fonction (feuille « Fonctions »)         | `ref` F-, dates, `authorized_by`, `decision_ref`, annulation                                                                            | N     |

`expires_at` est calculé par `computeExpiresAt()` (`src/server/reference.ts`) et représente le
**dernier jour de validité** : validité en mois, ou 31/12 de l'année d'obtention, ou 31/12 de
l'année atteinte après N mois si les deux sont posés ; `null` si la date d'obtention est inconnue
ou si la référence n'expire pas.

`perimetersOf()` (`src/server/perimeter.ts`) déduit les périmètres ACTION, LASER et FORMAT_GP
d'une personne de ses formations **validées et non expirées** et de ses nominations actives,
d'après `reference_items.perimeters`.

### Candidatures, intégration, suivi

| Table              | Rôle                             | Champs clés                                                       | Sens. |
| ------------------ | -------------------------------- | ----------------------------------------------------------------- | ----- |
| `candidacies`      | Candidature (une seule ouverte)  | `stage`, `source`, `owner_id`, `follow_up_at`, `closed_at`        | N     |
| `candidacy_events` | Historique des étapes            | `from_stage`, `to_stage`, `at`, `author_id`                       | N     |
| `mentorships`      | Parrainage                       | `mentee_id`, `mentor_id`, dates                                   | N     |
| `follow_ups`       | Points de suivi (3 mois, annuel) | `kind`, `scheduled_at`, `done_at`, `conducted_by_id`, `next_date` | N     |

### Dossier, documents, signature

| Table                 | Rôle                                     | Champs clés                                                                  | Sens.    |
| --------------------- | ---------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| `dossier_links`       | Lien sécurisé envoyé au candidat         | `token_hash` unique, `mode`, `expires_at`, `used_at`, `revoked_at`           | S (hash) |
| `dossier_submissions` | Contenu du dossier en ligne              | `status`, `data` JSONB (validé par Zod à l'étape 7), `schema_version`        | S        |
| `otp_challenges`      | Code à usage unique avant signature      | `code_hash`, `email`, `attempts`, `verified_at`                              | S        |
| `signatures`          | Signature d'un document                  | `signer_role`, `image_key`, `otp_challenge_id`, `ip_hash`, `document_hashes` | S        |
| `documents`           | Fichier stocké derrière `StorageService` | `kind`, `copy`, `storage_key` unique, `sha256`, `file_missing`               | S        |

### Rappels, notifications, paramètres

| Table            | Rôle                                   | Champs clés                                                                | Sens. |
| ---------------- | -------------------------------------- | -------------------------------------------------------------------------- | ----- |
| `reminder_rules` | Règles du moteur de rappels (étape 12) | `key` unique, `trigger`, `offset_days`, `recipients`, `channels`, `params` | N     |
| `notifications`  | Notification d'un responsable          | `(user_id, dedupe_key)` unique, `read_at`                                  | N     |
| `settings`       | Paramètres de l'outil                  | `key` unique, `value` JSONB                                                | N     |

### Journaux

| Table         | Rôle                                                                                                                            | Champs clés                                                                   | Sens.                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------- |
| `audit_logs`  | Toute écriture, champ par champ, connexions (LOGIN, LOGIN_DENIED, LOGOUT) ; `legacy_action` garde le libellé du Journal importé | `actor_id`/`actor_label`, `action`, `entity`, `field`, valeurs JSONB masquées | N (valeurs masquées) |
| `access_logs` | Consultations de données sensibles                                                                                              | `user_id`, `person_id`, `scope`, `context`                                    | N                    |

## Référentiel du seed

Les 21 premiers codes reprennent **exactement** l'onglet « Referentiel » de l'ancien classeur
(pas de donnée personnelle) : libellés, catégories, type, interdiction aux mineurs et échéance au
31/12. Aucun code n'a de validité en mois (`validity_months` nul partout) ni de prérequis dans le
classeur. PSC, FPSC et ASSIST_FORM sont des ajouts de Binivol, absents du classeur, à confirmer.
Source : `prisma/seed/referenceData.ts`.

| Ordre | Code        | Libellé                                           | Catégorie    | Type     | Interdite aux mineurs | Échéance 31/12 | Périmètres    | `managed_by`  | Note                                   |
| ----- | ----------- | ------------------------------------------------- | ------------ | -------- | --------------------- | -------------- | ------------- | ------------- | -------------------------------------- |
| 1     | PSE         | Premiers secours en équipe                        | FORMATION_IS | TRAINING | non                   | non            | ACTION, LASER | —             | —                                      |
| 2     | FCPSE       | Formation continue PSE                            | FORMATION_IS | TRAINING | non                   | **oui**        | —             | —             | Validité à renseigner                  |
| 3     | F_CI        | Formation chef d'intervention                     | FORMATION_IS | TRAINING | non                   | non            | —             | —             | —                                      |
| 4     | F_CH        | Formation chauffeur                               | FORMATION_IS | TRAINING | non                   | non            | —             | —             | —                                      |
| 5     | OPR         | Opérateur radio                                   | FORMATION_IS | TRAINING | non                   | non            | —             | —             | —                                      |
| 6     | ECG         | Formation ECG (réseau de secours)                 | FORMATION_IS | TRAINING | non                   | non            | —             | —             | —                                      |
| 7     | GQS         | Gestes qui sauvent                                | TRONC_COMMUN | TRAINING | non                   | non            | —             | —             | —                                      |
| 8     | CRB         | Croix-Rouge Bienvenue (eCRB)                      | TRONC_COMMUN | TRAINING | non                   | non            | —             | —             | —                                      |
| 9     | TCAU        | Tronc commun des acteurs de l'urgence (eTCAU)     | TRONC_COMMUN | TRAINING | non                   | non            | LASER         | —             | —                                      |
| 10    | TCAS        | Tronc commun des acteurs de la solidarité (eTCAS) | TRONC_COMMUN | TRAINING | non                   | non            | —             | —             | —                                      |
| 11    | CHEF_PAPS   | Chef de PAPS                                      | SECOURS      | FUNCTION | **oui**               | non            | —             | ACTION        | —                                      |
| 12    | CI          | Chef d'intervention (fonction)                    | SECOURS      | FUNCTION | **oui**               | non            | —             | LASER         | —                                      |
| 13    | CDPE        | Chef de dispositif de petite envergure            | SECOURS      | FUNCTION | **oui**               | non            | —             | ACTION        | —                                      |
| 14    | CI_SDIS     | CI réseau de secours SDIS                         | SECOURS      | FUNCTION | **oui**               | non            | —             | LASER         | —                                      |
| 15    | CH_TECH     | Chauffeur technique                               | SECOURS      | FUNCTION | **oui**               | non            | —             | ACTION, LASER | Interprétation à valider               |
| 16    | CH_FIXE     | Chauffeur fixe                                    | SECOURS      | FUNCTION | **oui**               | non            | —             | ACTION, LASER | Interprétation à valider               |
| 17    | CH_MOBILE   | Chauffeur mobile                                  | SECOURS      | FUNCTION | **oui**               | non            | —             | ACTION, LASER | Interprétation à valider               |
| 18    | CH_RESEAUX  | Chauffeur réseaux                                 | SECOURS      | FUNCTION | **oui**               | non            | —             | ACTION, LASER | Interprétation à valider               |
| 19    | FPSE        | Formateur PSE                                     | FORMATION_IS | TRAINING | non                   | non            | FORMAT_GP     | —             | Validité à renseigner                  |
| 20    | FCCI        | Formation continue chef d'intervention            | FORMATION_IS | TRAINING | non                   | **oui**        | —             | —             | Libellé à confirmer                    |
| 21    | TCEO        | Tronc commun des encadrants opérationnels         | FORMATION_IS | TRAINING | non                   | non            | —             | —             | —                                      |
| 22    | PSC         | Prévention et secours civiques de niveau 1        | TRONC_COMMUN | TRAINING | non                   | non            | ACTION        | —             | Hypothèse, absent de l'ancien classeur |
| 23    | FPSC        | Formateur PSC                                     | FORMATION_GP | TRAINING | non                   | non            | FORMAT_GP     | —             | Hypothèse, absent de l'ancien classeur |
| 24    | ASSIST_FORM | Assistant de formation                            | FORMATION_GP | FUNCTION | non                   | non            | FORMAT_GP     | FORMAT_GP     | Hypothèse, absent de l'ancien classeur |

Les notes « Interprétation à valider » portent le texte complet « Interprétation à valider
(équipage d'évacuation interdit aux mineurs, permis requis) ».

- **Périmètres** (`perimeters`, visibilité des profils) : ajout de Binivol, inchangé depuis
  l'étape 2. La case « Formateur » d'une personne (`is_trainer`) ajoute aussi FORMAT_GP.
- **Qui nomme à quelle fonction** (`managed_by`) : **répartition par défaut, à confirmer**.
  CHEF_PAPS et CDPE par ACTION ; CI et CI_SDIS par LASER ; les quatre CH_* par ACTION et LASER ;
  ASSIST_FORM par FORMAT GP. TOPAZE peut nommer à toutes les fonctions. Vide pour les
  formations (contrainte `reference_items_managed_by_functions_only`).
- **Échéance au 31/12** : le 31 décembre de l'année d'obtention, même pour une obtention en
  décembre (confirmé par la note de FCCI : « à refaire tous les ans, échéance au 31/12 »).

## Correspondance avec l'ancien classeur (pour l'étape 4)

Intitulés exacts de la ligne 1 de chaque onglet. Seule la structure est décrite ici, jamais
les données.

### Valeurs observées et conversion

| Colonne             | Valeurs du classeur                                                                                                                                                                                           | Valeur Binivol                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Statut              | Candidat, Actif, Suspendu, Inactif, Parti(e)                                                                                                                                                                  | CANDIDATE, ACTIVE, SUSPENDED, INACTIVE, LEFT (PAUSED n'existe pas dans le classeur)        |
| Aptitude (Pegass)   | Apte, Non apte, Retiré(e), À vérifier                                                                                                                                                                         | FIT, UNFIT, WITHDRAWN, TO_CHECK                                                            |
| Résultat (Sessions) | Validé, Inscrit(e), À confirmer, Non validé, Absent                                                                                                                                                           | PASSED, REGISTERED, TO_CONFIRM, FAILED, ABSENT                                             |
| Étape (Prospects)   | « Premier contact », « Dossier en cours »                                                                                                                                                                     | FIRST_CONTACT, FILE                                                                        |
| Source (Prospects)  | texte libre, casse variable (« Site internet » / « Site Internet »)                                                                                                                                           | texte libre, casse normalisée à l'import                                                   |
| Oui/Non             | « OUI », « NON » ou vide                                                                                                                                                                                      | `true`, `false`, et **vide = inconnu** (`null`), jamais `false`                            |
| Annulée (Fonctions) | vide, ou `JJ/MM/AAAA par <email> : <motif>`                                                                                                                                                                   | `cancelled_at`, `cancelled_by_id` (compte retrouvé par e-mail) ou libellé, `cancel_reason` |
| Action (Journal)    | Création de la base, Installation, Création, Modification, Modification directe, Modification directe (plage), Annulation, Paramètre, Dossier Drive, Sauvegarde, Envoi des alertes, Récapitulatif TCAU envoyé | `action = IMPORT`, libellé d'origine dans `legacy_action`                                  |

Une colonne booléenne non nullable en base (`is_member`, `other_aasc`,
`regular_minor_supervisor`, `parental_authorization`) recevra `false` quand la cellule est
vide ; l'import le signalera dans son rapport. `is_trainer` est nullable pour garder « inconnu ».

### Onglet « Benevoles » → `persons` (+ `person_sensitive`)

| Colonne                    | Table.champ                                    | Remarque                                                      |
| -------------------------- | ---------------------------------------------- | ------------------------------------------------------------- |
| NIVOL                      | `persons.nivol`                                | `normalizeNivol()` ; 46/46 au format 11 chiffres + 1 lettre   |
| Prénom, Nom                | `persons.first_name`, `last_name`              |                                                               |
| E-mail, Téléphone          | `persons.email`, `phone`                       |                                                               |
| Date de naissance          | `person_sensitive.birth_date`                  | sensible                                                      |
| Statut                     | `persons.status`                               | voir les valeurs ; `legacy_import = true` sur chaque ligne    |
| Date d'entrée              | `persons.entry_date`                           |                                                               |
| Date de départ             | `persons.left_at`                              | motif absent du classeur : `left_reason = OTHER` si Parti(e)  |
| Adhérent                   | `persons.is_member`                            | Oui/Non                                                       |
| Aptitude (Pegass)          | `persons.aptitude`                             | voir les valeurs                                              |
| Date aptitude              | `persons.aptitude_date`                        |                                                               |
| Autre AASC                 | `persons.other_aasc`                           | Oui/Non                                                       |
| Formateur                  | `persons.is_trainer`                           | Oui/Non/vide → `true`/`false`/`null` ; vrai → FORMAT_GP       |
| Encadrant régulier mineurs | `persons.regular_minor_supervisor`             | Oui/Non                                                       |
| Date vérif. B3             | `person_sensitive.b3_checked_at`               | sensible ; `b3_status = CLEAR` si la date est renseignée      |
| Autorisation parentale     | `person_sensitive.parental_authorization`      | sensible                                                      |
| Date autorisation          | `person_sensitive.parental_authorization_date` | sensible                                                      |
| Notes                      | `persons.notes`                                |                                                               |
| Modifié le, Modifié par    | `persons.updated_at`, `updated_by_id`          | compte retrouvé par e-mail, sinon libellé dans l'audit IMPORT |
| Dossier Drive              | `persons.legacy_drive_folder_id`               | identifiant de dossier, pour la reprise des fichiers          |

### Onglet « Prospects » → `persons` (CANDIDATE) + `candidacies`

| Colonne                           | Table.champ                                         | Remarque                                 |
| --------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| ID                                | rapport d'import et audit IMPORT                    | identifiant du classeur, sans équivalent |
| Prénom, Nom, E-mail, Téléphone    | `persons.first_name`, `last_name`, `email`, `phone` | statut CANDIDATE                         |
| Date de naissance                 | `person_sensitive.birth_date`                       | sensible                                 |
| Source, Intérêt                   | `candidacies.source`, `interest`                    |                                          |
| Date de premier contact           | `candidacies.first_contact_at`                      |                                          |
| Étape                             | `candidacies.stage`                                 | voir les valeurs                         |
| Prochaine action, Date de relance | `candidacies.next_action`, `follow_up_at`           |                                          |
| Notes                             | `persons.notes`                                     |                                          |
| NIVOL attribué                    | `persons.nivol`                                     | rapprochement avec l'onglet Benevoles    |
| Saisi le, Saisi par               | `candidacies.created_at`, `created_by_id`           |                                          |
| Modifié le, Modifié par           | `candidacies.updated_at`, `updated_by_id`           |                                          |

### Onglet « Sessions » → `training_records`

| Colonne             | Table.champ                                         | Remarque                                   |
| ------------------- | --------------------------------------------------- | ------------------------------------------ |
| ID                  | `training_records.ref` si au format S-, sinon audit | séquence recalée après import              |
| NIVOL               | `training_records.person_id`                        | rapprochement par NIVOL                    |
| Code                | `training_records.reference_id`                     | par `reference_items.code`                 |
| Date                | `training_records.date`                             | **vide sur la grande majorité des lignes** |
| Résultat            | `training_records.result`                           | voir les valeurs ; vide → TO_CONFIRM       |
| Organisme / lieu    | `training_records.place`                            |                                            |
| Lien Pegass         | `training_records.pegass_url`                       |                                            |
| Commentaire         | `training_records.comment`                          |                                            |
| Saisi le, Saisi par | `created_at`, `created_by_id`                       |                                            |

### Onglet « Fonctions » → `appointments`

| Colonne                    | Table.champ                                        | Remarque                                      |
| -------------------------- | -------------------------------------------------- | --------------------------------------------- |
| ID                         | `appointments.ref` si au format F-, sinon audit    | séquence recalée après import                 |
| NIVOL                      | `appointments.person_id`                           |                                               |
| Fonction                   | `appointments.reference_id`                        | doit être de type FUNCTION                    |
| Date de début, Date de fin | `start_date`, `end_date`                           |                                               |
| Autorisée par              | `authorized_by`                                    |                                               |
| Référence décision         | `decision_ref`                                     |                                               |
| Commentaire                | `comment`                                          |                                               |
| Saisi le, Saisi par        | `created_at`, `created_by_id`                      |                                               |
| Annulée                    | `cancelled_at`, `cancelled_by_id`, `cancel_reason` | analyse de `JJ/MM/AAAA par <email> : <motif>` |

### Onglet « Referentiel » → `reference_items`

| Colonne               | Table.champ                    | Remarque                 |
| --------------------- | ------------------------------ | ------------------------ |
| Code, Libellé         | `code`, `label`                |                          |
| Catégorie, Type       | `category`, `kind`             |                          |
| Ordre                 | `sort_order`                   |                          |
| Validité (mois)       | `validity_months`              | vide pour tous les codes |
| Prérequis             | `reference_item_prerequisites` | vide pour tous les codes |
| Interdite aux mineurs | `forbidden_for_minors`         |                          |
| Actif                 | `active`                       |                          |
| Source / commentaire  | `note`                         |                          |
| Échéance au 31/12     | `expires_end_of_year`          |                          |

### Onglet « Parametres » (Clé, Valeur, Description) → `settings`

| Clé                   | Binivol                         | Remarque                                                     |
| --------------------- | ------------------------------- | ------------------------------------------------------------ |
| DELAI_ALERTE_JOURS    | `ALERT_DAYS_BEFORE_EXPIRY`      |                                                              |
| CONSERVATION_ANS      | `RETENTION_YEARS_AFTER_LEAVE`   |                                                              |
| SAUVEGARDES_A_GARDER  | `BACKUPS_TO_KEEP`               |                                                              |
| CLASSIFICATION        | `DATA_CLASSIFICATION`           |                                                              |
| MAILS_VOEUX_ACTIFS    | `GREETING_EMAILS_ENABLED`       | e-mails de vœux                                              |
| EMAILS_ALERTES        | non repris                      | remplacé par `reminder_rules.recipients` (profils), étape 12 |
| EDITEURS              | non repris                      | remplacé par les comptes et profils (`users`), étape 3       |
| DOSSIER_SAUVEGARDE_ID | non repris                      | dossier Google Drive : remplacé par `StorageService`         |
| DOSSIER_BENEVOLES_ID  | non repris (présente deux fois) | dossier Google Drive : remplacé par `StorageService`         |
| VERSION               | non repris                      | version de l'ancien outil, sans objet                        |

### Onglet « Journal » → `audit_logs`

| Colonne                          | Table.champ                        | Remarque                                               |
| -------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| Horodatage                       | `at`                               |                                                        |
| Utilisateur                      | `actor_id` ou `actor_label`        | compte retrouvé par e-mail, sinon l'adresse en libellé |
| Action                           | `action = IMPORT`, `legacy_action` | libellé d'origine conservé                             |
| Table                            | `entity`                           |                                                        |
| Clé                              | `entity_id`                        |                                                        |
| Champ                            | `field`                            |                                                        |
| Ancienne valeur, Nouvelle valeur | `old_value`, `new_value`           | masquées si le champ est sensible                      |

### Colonnes non reprises

| Onglet     | Colonne                                                 | Raison                                                           |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| Prospects  | ID                                                      | identifiant interne du classeur ; gardé dans le rapport d'import |
| Parametres | EMAILS_ALERTES, EDITEURS                                | remplacés par les profils (droits, destinataires des rappels)    |
| Parametres | DOSSIER_SAUVEGARDE_ID, DOSSIER_BENEVOLES_ID (deux fois) | spécifiques à Google Drive, remplacés par `StorageService`       |
| Parametres | VERSION                                                 | version de l'ancien outil                                        |
