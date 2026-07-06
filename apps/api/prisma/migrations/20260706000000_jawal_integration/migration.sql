-- Add per-invoice Jawal Travel reconciliation tracking (mirrors Asateel).
-- Reuses the existing "AsateelRunStatus" enum as the vendor-agnostic run status.
ALTER TABLE "Invoice"
  ADD COLUMN "jawalRunId" TEXT,
  ADD COLUMN "jawalStatus" "AsateelRunStatus",
  ADD COLUMN "jawalQueuePosition" INTEGER,
  ADD COLUMN "jawalError" TEXT,
  ADD COLUMN "jawalFolderName" TEXT,
  ADD COLUMN "jawalTriggeredAt" TIMESTAMP(3),
  ADD COLUMN "jawalStartedAt" TIMESTAMP(3),
  ADD COLUMN "jawalFinishedAt" TIMESTAMP(3),
  ADD COLUMN "jawalLastPolledAt" TIMESTAMP(3),
  ADD COLUMN "jawalOutputDocumentId" TEXT;

CREATE UNIQUE INDEX "Invoice_jawalRunId_key" ON "Invoice"("jawalRunId");
CREATE INDEX "Invoice_jawalStatus_idx" ON "Invoice"("jawalStatus");
