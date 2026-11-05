-- Step 5: skills, languages, driving licences and annex competences are edited
-- from the person page. No physical deletion of business data: a removed
-- item is archived (archived_at) and stays in the audit trail.

-- AlterTable
ALTER TABLE "person_annexes" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "person_languages" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "person_licenses" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "person_skills" ADD COLUMN     "archived_at" TIMESTAMPTZ(3);
