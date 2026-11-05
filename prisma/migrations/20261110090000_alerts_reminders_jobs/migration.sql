
-- CreateEnum
CREATE TYPE "JobRunStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "AutomatedMessageKind" AS ENUM ('DIGEST', 'URGENCE_NOTICE', 'URGENCE_SUMMARY', 'BIRTHDAY', 'ENGAGEMENT_ANNIVERSARY', 'DOSSIER_REMINDER');

-- CreateEnum
CREATE TYPE "AutomatedMessageStatus" AS ENUM ('SENT', 'FAILED', 'SKIPPED');

-- AlterEnum


ALTER TYPE "ReminderTrigger" ADD VALUE 'PAUSE_RETURN';
ALTER TYPE "ReminderTrigger" ADD VALUE 'GREETINGS_REVIEW';

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "greeting_opt_out" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "status" "JobRunStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "summary" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automated_messages" (
    "id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "kind" "AutomatedMessageKind" NOT NULL,
    "status" "AutomatedMessageStatus" NOT NULL,
    "person_id" TEXT,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "automated_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "job_runs_job_day_key" ON "job_runs"("job", "day");

-- CreateIndex
CREATE UNIQUE INDEX "automated_messages_dedupe_key_key" ON "automated_messages"("dedupe_key");

-- CreateIndex
CREATE INDEX "automated_messages_kind_created_at_idx" ON "automated_messages"("kind", "created_at");


-- Step 12 defaults of the reminder rules, only where they still hold the step 2 values
-- (the rules become editable by TOPAZE and the seed no longer rewrites them).
UPDATE "reminder_rules" SET "offset_days" = 7, "label" = 'Candidature sans action depuis 7 jours'
  WHERE "key" = 'CANDIDACY_IDLE' AND "offset_days" = 14;
UPDATE "reminder_rules" SET "offset_days" = 5, "label" = 'Dossier envoyé et non signé depuis 5 jours'
  WHERE "key" = 'DOSSIER_UNSIGNED' AND "offset_days" = 7;
UPDATE "reminder_rules" SET "active" = true, "offset_days" = 0, "label" = 'Vérification annuelle du B3 (en janvier)'
  WHERE "key" = 'B3_ANNUAL' AND "offset_days" = 365;
