-- Step 5 (fix of the legacy import): the « Journal » sheet of the real
-- workbook has system actions (« Sauvegarde », « Envoi des alertes »…) whose
-- « Table » and « Clé » are empty. They are imported with entity and
-- entity_id null instead of an invented entity name.

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "entity" DROP NOT NULL;
