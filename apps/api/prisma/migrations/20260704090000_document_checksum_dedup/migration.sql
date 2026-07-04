ALTER TABLE "Document" ADD COLUMN "checksumSha256" TEXT;

CREATE INDEX "Document_invoiceId_fileName_sizeBytes_idx" ON "Document"("invoiceId", "fileName", "sizeBytes");
