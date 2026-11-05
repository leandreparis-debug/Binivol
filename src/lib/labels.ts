/**
 * French labels of every database enum. The single place where an enum value
 * becomes user-facing text. A test checks that each value has a label.
 *
 * Imports only `enums.ts` from the generated client, which is browser-safe.
 */
import type {
  AbandonReason,
  AccessScope,
  Aptitude,
  AuditAction,
  B3Status,
  CandidacyStage,
  Civility,
  DocumentCopy,
  DocumentKind,
  DossierLinkMode,
  FollowUpKind,
  ImportStatus,
  LanguageLevel,
  LeftReason,
  NotificationChannel,
  Perimeter,
  PersonStatus,
  Profile,
  ReferenceCategory,
  ReferenceKind,
  ReminderTrigger,
  SignatureInput,
  SignatureMethod,
  SignerRole,
  SkillLevel,
  SubmissionStatus,
  TrainingResult,
  TrainingWishStatus,
} from "@/generated/prisma/enums";
import type { PolicyAction } from "@/lib/actions";

export const PROFILE_LABELS: Record<Profile, string> = {
  TOPAZE: "TOPAZE · DLUS",
  ACTION: "ACTION · Missions de secours",
  LASER: "LASER · Urgence",
  FORMAT: "FORMAT · Formation interne",
  FORMAT_GP: "FORMAT GP · Formation grand public",
  DIAMANT: "DIAMANT · Animation des équipes",
};

export const PERIMETER_LABELS: Record<Perimeter, string> = {
  ACTION: "Postes de secours (ACTION)",
  LASER: "Urgence (LASER)",
  FORMAT_GP: "Formation grand public (FORMAT GP)",
};

export const CIVILITY_LABELS: Record<Civility, string> = {
  MME: "Mme",
  M: "M.",
};

export const PERSON_STATUS_LABELS: Record<PersonStatus, string> = {
  CANDIDATE: "Candidat",
  ACTIVE: "Actif",
  PAUSED: "En pause",
  SUSPENDED: "Suspendu",
  INACTIVE: "Inactif",
  LEFT: "Parti(e)",
};

export const LEFT_REASON_LABELS: Record<LeftReason, string> = {
  MOVED: "Déménagement",
  AVAILABILITY: "Manque de disponibilité",
  PERSONAL: "Raisons personnelles",
  TRANSFER: "Mutation vers une autre unité locale",
  EXCLUDED: "Exclusion",
  DECEASED: "Décès",
  OTHER: "Autre",
};

export const APTITUDE_LABELS: Record<Aptitude, string> = {
  FIT: "Apte",
  UNFIT: "Inapte",
  WITHDRAWN: "Retrait temporaire",
  TO_CHECK: "À vérifier",
};

export const B3_STATUS_LABELS: Record<B3Status, string> = {
  NOT_REQUESTED: "Non demandé",
  REQUESTED: "Demandé",
  CLEAR: "Vierge",
  FLAGGED: "Mention présente",
};

export const SKILL_LEVEL_LABELS: Record<SkillLevel, string> = {
  BEGINNER: "Débutant",
  CONFIRMED: "Confirmé",
  EXPERT: "Expert",
};

export const LANGUAGE_LEVEL_LABELS: Record<LanguageLevel, string> = {
  NOTIONS: "Notions",
  FLUENT: "Courant",
  BILINGUAL: "Bilingue",
};

export const REFERENCE_CATEGORY_LABELS: Record<ReferenceCategory, string> = {
  TRONC_COMMUN: "Tronc commun",
  FORMATION_IS: "Formation interne secours",
  SECOURS: "Secours",
  FORMATION_GP: "Formation grand public",
  AUTRE: "Autre",
};

export const REFERENCE_KIND_LABELS: Record<ReferenceKind, string> = {
  TRAINING: "Formation",
  FUNCTION: "Fonction",
};

export const TRAINING_RESULT_LABELS: Record<TrainingResult, string> = {
  REGISTERED: "Inscrit",
  PASSED: "Validé",
  FAILED: "Non validé",
  ABSENT: "Absent",
  TO_CONFIRM: "À confirmer",
};

export const TRAINING_WISH_STATUS_LABELS: Record<TrainingWishStatus, string> = {
  OPEN: "Ouvert",
  WAITLISTED: "Liste d'attente",
  SCHEDULED: "Planifié",
  DONE: "Réalisé",
  CANCELLED: "Annulé",
};

export const CANDIDACY_STAGE_LABELS: Record<CandidacyStage, string> = {
  FIRST_CONTACT: "Premier contact",
  MEETING: "Rencontre",
  CONFIRMED: "Engagement confirmé",
  FILE: "Dossier",
  GAIA: "Création Gaia",
  DONE: "Intégré",
  ABANDONED: "Abandon",
};

export const ABANDON_REASON_LABELS: Record<AbandonReason, string> = {
  NO_RESPONSE: "Ne répond plus",
  NOT_INTERESTED: "N'est plus intéressé(e)",
  UNAVAILABLE: "Pas disponible",
  REDIRECTED: "Orienté(e) ailleurs",
  OTHER: "Autre motif",
};

export const FOLLOW_UP_KIND_LABELS: Record<FollowUpKind, string> = {
  THREE_MONTHS: "Point à 3 mois",
  ANNUAL: "Point annuel",
  OTHER: "Autre point",
};

export const DOSSIER_LINK_MODE_LABELS: Record<DossierLinkMode, string> = {
  REMOTE: "À distance",
  ON_SITE: "Sur place",
};

export const SUBMISSION_STATUS_LABELS: Record<SubmissionStatus, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Envoyé",
  SIGNED: "Signé",
  VOID: "Annulé",
};

export const SIGNER_ROLE_LABELS: Record<SignerRole, string> = {
  VOLUNTEER: "Bénévole",
  PARENT: "Représentant légal",
  CRF_REPRESENTATIVE: "Représentant de la Croix-Rouge",
};

export const SIGNATURE_METHOD_LABELS: Record<SignatureMethod, string> = {
  OTP_EMAIL: "Code reçu par e-mail",
  IN_PERSON: "Identité vérifiée en présence",
  SESSION: "Session du responsable",
};

export const SIGNATURE_INPUT_LABELS: Record<SignatureInput, string> = {
  DRAWN: "Tracé",
  TYPED: "Nom saisi",
};

export const DOCUMENT_KIND_LABELS: Record<DocumentKind, string> = {
  DOSSIER: "Dossier d'engagement",
  CHARTE: "Charte du bénévole",
  APTITUDE: "Certificat d'aptitude",
  DIPLOMA_COPY: "Copie de diplôme",
  PARENTAL_AUTH: "Autorisation parentale",
  B3_ATTESTATION: "Attestation B3",
  ADHESION: "Bulletin d'adhésion",
  OTHER: "Autre document",
};

export const DOCUMENT_COPY_LABELS: Record<DocumentCopy, string> = {
  VOLUNTEER: "Exemplaire bénévole",
  UL: "Exemplaire unité locale",
  NONE: "Sans exemplaire",
};

export const REMINDER_TRIGGER_LABELS: Record<ReminderTrigger, string> = {
  CANDIDACY_IDLE: "Candidature sans action",
  DOSSIER_UNSIGNED: "Dossier non signé",
  TRAINING_EXPIRING: "Formation arrivant à échéance",
  FOLLOWUP_DUE: "Point de suivi à faire",
  PERSON_INACTIVE: "Bénévole sans activité",
  B3_ANNUAL: "Vérification annuelle du B3",
};

export const NOTIFICATION_CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: "Dans l'application",
  EMAIL_DIGEST: "Récapitulatif par e-mail",
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  CREATE: "Création",
  UPDATE: "Modification",
  CANCEL: "Annulation",
  ARCHIVE: "Archivage",
  IMPORT: "Import",
  PURGE: "Purge",
  LOGIN: "Connexion",
  LOGIN_DENIED: "Connexion refusée",
  LOGOUT: "Déconnexion",
  EXPORT: "Export",
};

export const ACCESS_SCOPE_LABELS: Record<AccessScope, string> = {
  SENSITIVE_VIEW: "Consultation de données sensibles",
  DOCUMENT_VIEW: "Consultation d'un document",
  EXPORT: "Export",
};

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  RUNNING: "En cours",
  SUCCEEDED: "Terminé",
  FAILED: "Échec",
};

/** Every label table, keyed by the enum name in `prisma/schema.prisma`. */
export const ENUM_LABELS = {
  Profile: PROFILE_LABELS,
  Perimeter: PERIMETER_LABELS,
  Civility: CIVILITY_LABELS,
  PersonStatus: PERSON_STATUS_LABELS,
  LeftReason: LEFT_REASON_LABELS,
  Aptitude: APTITUDE_LABELS,
  B3Status: B3_STATUS_LABELS,
  SkillLevel: SKILL_LEVEL_LABELS,
  LanguageLevel: LANGUAGE_LEVEL_LABELS,
  ReferenceCategory: REFERENCE_CATEGORY_LABELS,
  ReferenceKind: REFERENCE_KIND_LABELS,
  TrainingResult: TRAINING_RESULT_LABELS,
  TrainingWishStatus: TRAINING_WISH_STATUS_LABELS,
  CandidacyStage: CANDIDACY_STAGE_LABELS,
  FollowUpKind: FOLLOW_UP_KIND_LABELS,
  AbandonReason: ABANDON_REASON_LABELS,
  DossierLinkMode: DOSSIER_LINK_MODE_LABELS,
  SubmissionStatus: SUBMISSION_STATUS_LABELS,
  SignerRole: SIGNER_ROLE_LABELS,
  SignatureMethod: SIGNATURE_METHOD_LABELS,
  SignatureInput: SIGNATURE_INPUT_LABELS,
  DocumentKind: DOCUMENT_KIND_LABELS,
  DocumentCopy: DOCUMENT_COPY_LABELS,
  ReminderTrigger: REMINDER_TRIGGER_LABELS,
  NotificationChannel: NOTIFICATION_CHANNEL_LABELS,
  AuditAction: AUDIT_ACTION_LABELS,
  AccessScope: ACCESS_SCOPE_LABELS,
  ImportStatus: IMPORT_STATUS_LABELS,
} as const;

export type EnumName = keyof typeof ENUM_LABELS;

/** French label of every action of the access policy (`src/lib/actions.ts`). */
export const POLICY_ACTION_LABELS: Record<PolicyAction, string> = {
  "person.directory.read": "Consulter l'annuaire (nom, NIVOL, statut, e-mail, téléphone)",
  "person.full.read": "Consulter la fiche complète (hors données sensibles)",
  "person.sensitive.read":
    "Consulter les données sensibles (naissance, adresse, personnes à prévenir, B3, autorisation parentale)",
  "person.update": "Modifier l'identité et les coordonnées",
  "person.status.change": "Changer le statut d'une personne",
  "person.nivol.correct": "Corriger le NIVOL (motif obligatoire)",
  "training.read": "Consulter les formations suivies et les souhaits",
  "training.write": "Saisir et modifier les formations suivies",
  "trainingSession.manage": "Gérer les sessions de formation",
  "trainingWish.manage": "Gérer les souhaits de formation",
  "appointment.read": "Consulter les nominations",
  "appointment.write": "Nommer à une fonction ou annuler une nomination",
  "candidacy.manage": "Gérer les candidatures",
  "candidacy.create": "Créer un candidat ou réengager une personne",
  "dossier.manage": "Gérer les dossiers en ligne",
  "mentorship.manage": "Gérer les parrainages",
  "followUp.manage": "Gérer les points de suivi",
  "document.read": "Consulter les documents",
  "document.upload": "Déposer et archiver des documents",
  "document.archived.read": "Consulter les documents archivés",
  "user.manage": "Gérer les comptes et leurs profils",
  "reference.manage": "Gérer le référentiel des formations et fonctions",
  "setting.manage": "Gérer les paramètres",
  "reminderRule.manage": "Gérer les règles de rappel",
  "audit.read": "Consulter le journal d'audit",
  "accessLog.read": "Consulter le journal des consultations sensibles",
  "person.export": "Exporter les données des personnes",
  "import.run": "Importer l'ancien classeur",
  "mail.log.read": "Consulter les e-mails du pilote de démonstration",
  "notification.readOwn": "Consulter ses notifications",
};
