-- AlterTable
ALTER TABLE "candidacies" ADD COLUMN     "gaia_checklist" JSONB NOT NULL DEFAULT '{}';

-- AlterTable
ALTER TABLE "follow_ups" ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(3),
ADD COLUMN     "cancelled_by_id" TEXT;


-- A cancelled follow-up gives its reason.
ALTER TABLE "follow_ups"
  ADD CONSTRAINT "follow_ups_cancel_reason" CHECK (cancelled_at IS NULL OR cancel_reason IS NOT NULL);
