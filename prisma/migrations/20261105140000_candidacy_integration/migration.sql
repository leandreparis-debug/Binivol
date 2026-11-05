-- Step 6: candidates and integration.
-- - abandon_reason: closed list of reasons; the existing free text column
--   abandoned_reason stays as the abandonment note (Prisma field abandonNote);
-- - meeting_at: date and time of the meeting at the local unit;
-- - notes: free notes on the candidacy.

-- CreateEnum
CREATE TYPE "AbandonReason" AS ENUM ('NO_RESPONSE', 'NOT_INTERESTED', 'UNAVAILABLE', 'REDIRECTED', 'OTHER');

-- AlterTable
ALTER TABLE "candidacies" ADD COLUMN     "abandon_reason" "AbandonReason",
ADD COLUMN     "meeting_at" TIMESTAMPTZ(3),
ADD COLUMN     "notes" TEXT;

-- Existing abandoned candidacies (seed, import) had a free text only.
UPDATE "candidacies" SET "abandon_reason" = 'OTHER'
  WHERE "stage" = 'ABANDONED' AND "abandon_reason" IS NULL;

-- An abandoned candidacy always has a reason.
ALTER TABLE "candidacies"
  ADD CONSTRAINT "candidacies_abandon_reason"
  CHECK ("stage" <> 'ABANDONED' OR "abandon_reason" IS NOT NULL);
