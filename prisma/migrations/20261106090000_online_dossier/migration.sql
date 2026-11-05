-- Step 7: online volunteer file.
-- - dossier_attachments: files attached to a draft dossier (sensitive); they become
--   documents of the person when the dossier is submitted;
-- - outbound_mails: e-mails written by the `log` mail driver instead of being sent,
--   with an encrypted payload (a dossier link never sits in clear in the database).

-- CreateTable
CREATE TABLE "dossier_attachments" (
    "id" TEXT NOT NULL,
    "submission_id" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "document_id" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "updated_by_id" TEXT,

    CONSTRAINT "dossier_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbound_mails" (
    "id" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,

    CONSTRAINT "outbound_mails_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dossier_attachments_storage_key_key" ON "dossier_attachments"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "dossier_attachments_document_id_key" ON "dossier_attachments"("document_id");

-- CreateIndex
CREATE INDEX "dossier_attachments_submission_id_idx" ON "dossier_attachments"("submission_id");

-- CreateIndex
CREATE INDEX "outbound_mails_created_at_idx" ON "outbound_mails"("created_at");

-- AddForeignKey
ALTER TABLE "dossier_attachments" ADD CONSTRAINT "dossier_attachments_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "dossier_submissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
