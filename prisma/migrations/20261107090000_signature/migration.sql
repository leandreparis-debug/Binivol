-- Step 8: electronic signature and official PDFs.
-- - submission status COMPLETE (countersigned, documents stored), countersignature
--   claim (concurrency) and the state of the final e-mail;
-- - otp_challenges: the signer the code is for (volunteer or legal guardian);
-- - signatures: method (code by e-mail, in person, responsible's session), verified
--   e-mail, typed name as an alternative to the drawn image, one per role and dossier;
-- - documents: version and source dossier of generated documents;
-- - outbound_mails: names and sizes of the attachments (log driver).

-- CreateEnum
CREATE TYPE "SignatureMethod" AS ENUM ('OTP_EMAIL', 'IN_PERSON', 'SESSION');

-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'COMPLETE';

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "submission_id" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "dossier_submissions" ADD COLUMN     "completed_at" TIMESTAMPTZ(3),
ADD COLUMN     "countersign_started_at" TIMESTAMPTZ(3),
ADD COLUMN     "final_mail_error" TEXT,
ADD COLUMN     "final_mail_sent_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "otp_challenges" ADD COLUMN     "signer_role" "SignerRole" NOT NULL DEFAULT 'VOLUNTEER';

-- AlterTable
ALTER TABLE "signatures" ADD COLUMN     "method" "SignatureMethod" NOT NULL DEFAULT 'OTP_EMAIL',
ADD COLUMN     "typed_name" TEXT,
ADD COLUMN     "verified_by_id" TEXT,
ADD COLUMN     "verified_email" TEXT,
ALTER COLUMN "image_key" DROP NOT NULL;

-- AlterTable
ALTER TABLE "outbound_mails" ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]';

-- CreateIndex
CREATE UNIQUE INDEX "signatures_submission_id_signer_role_key" ON "signatures"("submission_id", "signer_role");


-- A signature is drawn (image) or typed (name), never neither.
ALTER TABLE "signatures" ADD CONSTRAINT "signatures_image_or_typed"
  CHECK ("image_key" IS NOT NULL OR "typed_name" IS NOT NULL);

-- CreateIndex
CREATE INDEX "documents_submission_id_idx" ON "documents"("submission_id");
