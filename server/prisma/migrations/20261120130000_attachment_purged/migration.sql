-- The file itself was removed from storage some time after the attachment was deleted.
ALTER TABLE "Attachment" ADD COLUMN "purgedAt" TIMESTAMP(3);
CREATE INDEX "Attachment_deletedAt_purgedAt_idx" ON "Attachment"("deletedAt", "purgedAt");
