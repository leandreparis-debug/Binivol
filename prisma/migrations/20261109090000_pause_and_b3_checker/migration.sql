-- AlterTable
ALTER TABLE "person_sensitive" ADD COLUMN     "b3_checked_by_id" TEXT;

-- AlterTable
ALTER TABLE "persons" ADD COLUMN     "pause_reason" TEXT,
ADD COLUMN     "pause_until" DATE,
ADD COLUMN     "paused_at" DATE;


-- A planned return is not before the start of the pause.
ALTER TABLE "persons"
  ADD CONSTRAINT "persons_pause_dates" CHECK (pause_until IS NULL OR paused_at IS NULL OR pause_until >= paused_at);
