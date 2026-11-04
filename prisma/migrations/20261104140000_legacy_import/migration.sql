-- Binivol step 4: import of the legacy workbook (legacy ids, journal dedup, import runs)
-- and nullable yes/no columns (an empty legacy cell means unknown, not false).

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "legacy_ref" TEXT;

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "legacy_hash" TEXT;

-- AlterTable
ALTER TABLE "candidacies" ADD COLUMN     "legacy_ref" TEXT;

-- AlterTable
ALTER TABLE "person_sensitive" ALTER COLUMN "parental_authorization" DROP NOT NULL;

-- AlterTable
ALTER TABLE "persons" ALTER COLUMN "is_member" DROP NOT NULL,
ALTER COLUMN "other_aasc" DROP NOT NULL,
ALTER COLUMN "regular_minor_supervisor" DROP NOT NULL;

-- AlterTable
ALTER TABLE "training_records" ADD COLUMN     "legacy_ref" TEXT;

-- CreateTable
CREATE TABLE "import_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "actor_label" TEXT NOT NULL,
    "dry_run" BOOLEAN NOT NULL,
    "status" "ImportStatus" NOT NULL DEFAULT 'RUNNING',
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(3),
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "person_count" INTEGER NOT NULL DEFAULT 0,
    "counts" JSONB NOT NULL DEFAULT '{}',
    "report" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_runs_file_sha256_started_at_idx" ON "import_runs"("file_sha256", "started_at");

-- CreateIndex
CREATE INDEX "import_runs_started_at_idx" ON "import_runs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_legacy_ref_key" ON "appointments"("legacy_ref");

-- CreateIndex
CREATE UNIQUE INDEX "audit_logs_legacy_hash_key" ON "audit_logs"("legacy_hash");

-- CreateIndex
CREATE UNIQUE INDEX "candidacies_legacy_ref_key" ON "candidacies"("legacy_ref");

-- CreateIndex
CREATE UNIQUE INDEX "training_records_legacy_ref_key" ON "training_records"("legacy_ref");
