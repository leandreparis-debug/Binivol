-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('OTP_EMAIL', 'IN_PERSON', 'SESSION');

-- CreateEnum
CREATE TYPE "SignatureInput" AS ENUM ('DRAWN', 'TYPED');

-- DropIndex
DROP INDEX "signatures_submission_id_idx";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "submission_id" TEXT;

-- AlterTable
ALTER TABLE "dossier_submissions" ADD COLUMN     "mail_failed_at" TIMESTAMPTZ(3),
ADD COLUMN     "mail_sent_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "otp_challenges" ADD COLUMN     "signer_role" "SignerRole" NOT NULL DEFAULT 'VOLUNTEER';

-- AlterTable
ALTER TABLE "outbound_mails" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "signatures" ADD COLUMN     "input_kind" "SignatureInput" NOT NULL DEFAULT 'DRAWN',
ADD COLUMN     "method" "SignatureMethod" NOT NULL DEFAULT 'OTP_EMAIL',
ADD COLUMN     "verified_by_name" TEXT,
ADD COLUMN     "verified_email" TEXT;

-- CreateIndex
CREATE INDEX "documents_submission_id_idx" ON "documents"("submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "signatures_submission_id_signer_role_key" ON "signatures"("submission_id", "signer_role");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "dossier_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- A signature checked in person names the responsible who checked it.
ALTER TABLE "signatures"
  ADD CONSTRAINT "signatures_in_person_verifier" CHECK (method <> 'IN_PERSON' OR verified_by_name IS NOT NULL);
