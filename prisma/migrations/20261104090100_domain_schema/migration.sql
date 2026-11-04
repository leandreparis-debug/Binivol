
-- CreateEnum
CREATE TYPE "Profile" AS ENUM ('TOPAZE', 'ACTION', 'LASER', 'FORMAT', 'FORMAT_GP', 'DIAMANT');

-- CreateEnum
CREATE TYPE "Perimeter" AS ENUM ('ACTION', 'LASER', 'FORMAT_GP');

-- CreateEnum
CREATE TYPE "Civility" AS ENUM ('MME', 'M');

-- CreateEnum
CREATE TYPE "PersonStatus" AS ENUM ('CANDIDATE', 'ACTIVE', 'PAUSED', 'SUSPENDED', 'INACTIVE', 'LEFT');

-- CreateEnum
CREATE TYPE "LeftReason" AS ENUM ('MOVED', 'AVAILABILITY', 'PERSONAL', 'TRANSFER', 'EXCLUDED', 'DECEASED', 'OTHER');

-- CreateEnum
CREATE TYPE "Aptitude" AS ENUM ('FIT', 'UNFIT', 'WITHDRAWN', 'TO_CHECK');

-- CreateEnum
CREATE TYPE "B3Status" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'CLEAR', 'FLAGGED');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('BEGINNER', 'CONFIRMED', 'EXPERT');

-- CreateEnum
CREATE TYPE "LanguageLevel" AS ENUM ('NOTIONS', 'FLUENT', 'BILINGUAL');

-- CreateEnum
CREATE TYPE "ReferenceCategory" AS ENUM ('TRONC_COMMUN', 'FORMATION_IS', 'SECOURS', 'FORMATION_GP', 'AUTRE');

-- CreateEnum
CREATE TYPE "ReferenceKind" AS ENUM ('TRAINING', 'FUNCTION');

-- CreateEnum
CREATE TYPE "TrainingResult" AS ENUM ('REGISTERED', 'PASSED', 'FAILED', 'ABSENT', 'TO_CONFIRM');

-- CreateEnum
CREATE TYPE "TrainingWishStatus" AS ENUM ('OPEN', 'WAITLISTED', 'SCHEDULED', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CandidacyStage" AS ENUM ('FIRST_CONTACT', 'MEETING', 'CONFIRMED', 'FILE', 'GAIA', 'DONE', 'ABANDONED');

-- CreateEnum
CREATE TYPE "FollowUpKind" AS ENUM ('THREE_MONTHS', 'ANNUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "DossierLinkMode" AS ENUM ('REMOTE', 'ON_SITE');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'SIGNED', 'VOID');

-- CreateEnum
CREATE TYPE "SignerRole" AS ENUM ('VOLUNTEER', 'PARENT', 'CRF_REPRESENTATIVE');

-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('DOSSIER', 'CHARTE', 'APTITUDE', 'DIPLOMA_COPY', 'PARENTAL_AUTH', 'B3_ATTESTATION', 'ADHESION', 'OTHER');

-- CreateEnum
CREATE TYPE "DocumentCopy" AS ENUM ('VOLUNTEER', 'UL', 'NONE');

-- CreateEnum
CREATE TYPE "ReminderTrigger" AS ENUM ('CANDIDACY_IDLE', 'DOSSIER_UNSIGNED', 'TRAINING_EXPIRING', 'FOLLOWUP_DUE', 'PERSON_INACTIVE', 'B3_ANNUAL');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL_DIGEST');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'CANCEL', 'ARCHIVE', 'IMPORT', 'PURGE', 'LOGIN', 'EXPORT');

-- CreateEnum
CREATE TYPE "AccessScope" AS ENUM ('SENSITIVE_VIEW', 'DOCUMENT_VIEW', 'EXPORT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "profile" "Profile" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT binivol_next_ref('P-'::text, 'person_ref_seq'::regclass),
    "nivol" TEXT,
    "civility" "Civility",
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "birth_name" TEXT,
    "usage_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "pro_email" TEXT,
    "pro_phone" TEXT,
    "crf_email" TEXT,
    "status" "PersonStatus" NOT NULL DEFAULT 'CANDIDATE',
    "entry_date" DATE,
    "left_at" DATE,
    "left_reason" "LeftReason",
    "left_comment" TEXT,
    "is_member" BOOLEAN NOT NULL DEFAULT false,
    "aptitude" "Aptitude",
    "aptitude_date" DATE,
    "other_aasc" BOOLEAN NOT NULL DEFAULT false,
    "regular_minor_supervisor" BOOLEAN NOT NULL DEFAULT false,
    "profession" TEXT,
    "sector" TEXT,
    "company" TEXT,
    "notes" TEXT,
    "legacy_import" BOOLEAN NOT NULL DEFAULT false,
    "archived_at" TIMESTAMPTZ(3),
    "purge_eligible_at" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_sensitive" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "birth_date" DATE,
    "birth_city" TEXT,
    "birth_department" TEXT,
    "birth_country" TEXT,
    "street" TEXT,
    "address_complement" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" TEXT,
    "b3_checked_at" DATE,
    "b3_status" "B3Status",
    "parental_authorization" BOOLEAN NOT NULL DEFAULT false,
    "parental_authorization_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "person_sensitive_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_contacts" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "civility" "Civility",
    "last_name" TEXT NOT NULL,
    "first_name" TEXT,
    "relationship" TEXT,
    "street" TEXT,
    "postal_code" TEXT,
    "city" TEXT,
    "country" TEXT,
    "phone_1" TEXT,
    "phone_2" TEXT,
    "email" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "emergency_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_skills" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "level" "SkillLevel" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "person_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_languages" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "level" "LanguageLevel" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "person_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_licenses" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "person_licenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_declared_diplomas" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "person_declared_diplomas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_wished_activities" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "person_wished_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "person_annexes" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT,
    "valid_until" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "person_annexes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" "ReferenceCategory" NOT NULL,
    "kind" "ReferenceKind" NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "validity_months" INTEGER,
    "expires_end_of_year" BOOLEAN NOT NULL DEFAULT false,
    "forbidden_for_minors" BOOLEAN NOT NULL DEFAULT false,
    "perimeters" "Perimeter"[] DEFAULT ARRAY[]::"Perimeter"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "reference_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_item_prerequisites" (
    "item_id" TEXT NOT NULL,
    "prerequisite_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_item_prerequisites_pkey" PRIMARY KEY ("item_id","prerequisite_id")
);

-- CreateTable
CREATE TABLE "training_sessions" (
    "id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "place" TEXT,
    "pegass_url" TEXT,
    "capacity" INTEGER,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "training_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_records" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT binivol_next_ref('S-'::text, 'training_record_ref_seq'::regclass),
    "person_id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "session_id" TEXT,
    "date" DATE,
    "result" "TrainingResult" NOT NULL DEFAULT 'REGISTERED',
    "place" TEXT,
    "pegass_url" TEXT,
    "comment" TEXT,
    "expires_at" DATE,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "training_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_wishes" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "status" "TrainingWishStatus" NOT NULL DEFAULT 'OPEN',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "session_id" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "training_wishes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "ref" TEXT NOT NULL DEFAULT binivol_next_ref('F-'::text, 'appointment_ref_seq'::regclass),
    "person_id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "authorized_by" TEXT,
    "decision_ref" TEXT,
    "comment" TEXT,
    "cancelled_at" TIMESTAMPTZ(3),
    "cancelled_by_id" TEXT,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidacies" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "stage" "CandidacyStage" NOT NULL DEFAULT 'FIRST_CONTACT',
    "source" TEXT,
    "interest" TEXT,
    "first_contact_at" TIMESTAMPTZ(3),
    "next_action" TEXT,
    "follow_up_at" DATE,
    "owner_id" TEXT,
    "abandoned_reason" TEXT,
    "closed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "candidacies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidacy_events" (
    "id" TEXT NOT NULL,
    "candidacy_id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "author_id" TEXT,
    "from_stage" "CandidacyStage",
    "to_stage" "CandidacyStage" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "candidacy_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentorships" (
    "id" TEXT NOT NULL,
    "mentee_id" TEXT NOT NULL,
    "mentor_id" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "mentorships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "follow_ups" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "kind" "FollowUpKind" NOT NULL,
    "scheduled_at" DATE,
    "done_at" DATE,
    "conducted_by_id" TEXT,
    "summary" TEXT,
    "next_date" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_links" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "mode" "DossierLinkMode" NOT NULL DEFAULT 'REMOTE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "dossier_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_submissions" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "link_id" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'DRAFT',
    "data" JSONB NOT NULL DEFAULT '{}',
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "submitted_at" TIMESTAMPTZ(3),
    "signed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "dossier_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_challenges" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "verified_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "otp_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signatures" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "signer_role" "SignerRole" NOT NULL,
    "signer_name" TEXT NOT NULL,
    "signer_quality" TEXT,
    "image_key" TEXT NOT NULL,
    "signed_at" TIMESTAMPTZ(3) NOT NULL,
    "otp_challenge_id" TEXT,
    "user_agent" TEXT,
    "ip_hash" TEXT,
    "document_hashes" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "copy" "DocumentCopy" NOT NULL DEFAULT 'NONE',
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "file_missing" BOOLEAN NOT NULL DEFAULT false,
    "expires_at" DATE,
    "uploaded_by_id" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_rules" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "trigger" "ReminderTrigger" NOT NULL,
    "offset_days" INTEGER NOT NULL,
    "recipients" "Profile"[] DEFAULT ARRAY[]::"Profile"[],
    "channels" "NotificationChannel"[] DEFAULT ARRAY['IN_APP']::"NotificationChannel"[],
    "params" JSONB NOT NULL DEFAULT '{}',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "reminder_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rule_id" TEXT,
    "person_id" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT,
    "actor_label" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "field" TEXT,
    "old_value" JSONB,
    "new_value" JSONB,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" TEXT,
    "person_id" TEXT,
    "scope" "AccessScope" NOT NULL,
    "context" TEXT,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "user_profiles_user_id_profile_key" ON "user_profiles"("user_id", "profile");

-- CreateIndex
CREATE UNIQUE INDEX "persons_ref_key" ON "persons"("ref");

-- CreateIndex
CREATE UNIQUE INDEX "persons_nivol_key" ON "persons"("nivol");

-- CreateIndex
CREATE INDEX "persons_last_name_idx" ON "persons"("last_name");

-- CreateIndex
CREATE INDEX "persons_status_idx" ON "persons"("status");

-- CreateIndex
CREATE INDEX "persons_nivol_idx" ON "persons"("nivol");

-- CreateIndex
CREATE UNIQUE INDEX "person_sensitive_person_id_key" ON "person_sensitive"("person_id");

-- CreateIndex
CREATE INDEX "emergency_contacts_person_id_position_idx" ON "emergency_contacts"("person_id", "position");

-- CreateIndex
CREATE INDEX "person_skills_person_id_idx" ON "person_skills"("person_id");

-- CreateIndex
CREATE INDEX "person_languages_person_id_idx" ON "person_languages"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "person_licenses_person_id_category_key" ON "person_licenses"("person_id", "category");

-- CreateIndex
CREATE INDEX "person_declared_diplomas_person_id_idx" ON "person_declared_diplomas"("person_id");

-- CreateIndex
CREATE INDEX "person_wished_activities_person_id_idx" ON "person_wished_activities"("person_id");

-- CreateIndex
CREATE INDEX "person_annexes_person_id_idx" ON "person_annexes"("person_id");

-- CreateIndex
CREATE UNIQUE INDEX "reference_items_code_key" ON "reference_items"("code");

-- CreateIndex
CREATE INDEX "reference_items_kind_active_sort_order_idx" ON "reference_items"("kind", "active", "sort_order");

-- CreateIndex
CREATE INDEX "training_sessions_reference_id_start_date_idx" ON "training_sessions"("reference_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "training_records_ref_key" ON "training_records"("ref");

-- CreateIndex
CREATE INDEX "training_records_person_id_idx" ON "training_records"("person_id");

-- CreateIndex
CREATE INDEX "training_records_reference_id_idx" ON "training_records"("reference_id");

-- CreateIndex
CREATE INDEX "training_records_expires_at_idx" ON "training_records"("expires_at");

-- CreateIndex
CREATE INDEX "training_wishes_reference_id_status_idx" ON "training_wishes"("reference_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "training_wishes_one_open" ON "training_wishes"("person_id", "reference_id") WHERE (status = ANY (ARRAY['OPEN'::"TrainingWishStatus", 'WAITLISTED'::"TrainingWishStatus", 'SCHEDULED'::"TrainingWishStatus"]));

-- CreateIndex
CREATE UNIQUE INDEX "appointments_ref_key" ON "appointments"("ref");

-- CreateIndex
CREATE INDEX "appointments_person_id_idx" ON "appointments"("person_id");

-- CreateIndex
CREATE INDEX "appointments_reference_id_idx" ON "appointments"("reference_id");

-- CreateIndex
CREATE INDEX "candidacies_stage_idx" ON "candidacies"("stage");

-- CreateIndex
CREATE UNIQUE INDEX "candidacies_one_open" ON "candidacies"("person_id") WHERE (closed_at IS NULL);

-- CreateIndex
CREATE INDEX "candidacy_events_candidacy_id_at_idx" ON "candidacy_events"("candidacy_id", "at");

-- CreateIndex
CREATE INDEX "mentorships_mentee_id_idx" ON "mentorships"("mentee_id");

-- CreateIndex
CREATE INDEX "mentorships_mentor_id_idx" ON "mentorships"("mentor_id");

-- CreateIndex
CREATE INDEX "follow_ups_person_id_idx" ON "follow_ups"("person_id");

-- CreateIndex
CREATE INDEX "follow_ups_scheduled_at_idx" ON "follow_ups"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "dossier_links_token_hash_key" ON "dossier_links"("token_hash");

-- CreateIndex
CREATE INDEX "dossier_links_person_id_idx" ON "dossier_links"("person_id");

-- CreateIndex
CREATE INDEX "dossier_submissions_person_id_idx" ON "dossier_submissions"("person_id");

-- CreateIndex
CREATE INDEX "otp_challenges_submission_id_idx" ON "otp_challenges"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_otp_challenge_id_key" ON "signatures"("otp_challenge_id");

-- CreateIndex
CREATE INDEX "signatures_submission_id_idx" ON "signatures"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");

-- CreateIndex
CREATE INDEX "documents_person_id_kind_idx" ON "documents"("person_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_rules_key_key" ON "reminder_rules"("key");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_dedupe_key_key" ON "notifications"("user_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "settings_key_key" ON "settings"("key");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "access_logs_person_id_at_idx" ON "access_logs"("person_id", "at");

-- CreateIndex
CREATE INDEX "access_logs_user_id_at_idx" ON "access_logs"("user_id", "at");

-- AddForeignKey
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_sensitive" ADD CONSTRAINT "person_sensitive_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emergency_contacts" ADD CONSTRAINT "emergency_contacts_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_skills" ADD CONSTRAINT "person_skills_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_languages" ADD CONSTRAINT "person_languages_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_licenses" ADD CONSTRAINT "person_licenses_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_declared_diplomas" ADD CONSTRAINT "person_declared_diplomas_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_wished_activities" ADD CONSTRAINT "person_wished_activities_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "person_annexes" ADD CONSTRAINT "person_annexes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_item_prerequisites" ADD CONSTRAINT "reference_item_prerequisites_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "reference_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reference_item_prerequisites" ADD CONSTRAINT "reference_item_prerequisites_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "reference_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "reference_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "reference_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_records" ADD CONSTRAINT "training_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_wishes" ADD CONSTRAINT "training_wishes_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_wishes" ADD CONSTRAINT "training_wishes_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "reference_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_wishes" ADD CONSTRAINT "training_wishes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "training_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_reference_id_fkey" FOREIGN KEY ("reference_id") REFERENCES "reference_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacy_events" ADD CONSTRAINT "candidacy_events_candidacy_id_fkey" FOREIGN KEY ("candidacy_id") REFERENCES "candidacies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacy_events" ADD CONSTRAINT "candidacy_events_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_mentee_id_fkey" FOREIGN KEY ("mentee_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentorships" ADD CONSTRAINT "mentorships_mentor_id_fkey" FOREIGN KEY ("mentor_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_conducted_by_id_fkey" FOREIGN KEY ("conducted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_links" ADD CONSTRAINT "dossier_links_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_links" ADD CONSTRAINT "dossier_links_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_submissions" ADD CONSTRAINT "dossier_submissions_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dossier_submissions" ADD CONSTRAINT "dossier_submissions_link_id_fkey" FOREIGN KEY ("link_id") REFERENCES "dossier_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_challenges" ADD CONSTRAINT "otp_challenges_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "dossier_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "dossier_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_otp_challenge_id_fkey" FOREIGN KEY ("otp_challenge_id") REFERENCES "otp_challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "reminder_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
