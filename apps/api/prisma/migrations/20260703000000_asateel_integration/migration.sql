-- Add supplier ERP integration routing and per-invoice Asateel reconciliation tracking.
CREATE TYPE "SupplierErpIntegration" AS ENUM ('ASATEEL', 'JAWAL');
CREATE TYPE "AsateelRegion" AS ENUM ('CENTRAL', 'PROJECTS', 'ADMIN');
CREATE TYPE "AsateelRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'STATUS_LOST');

ALTER TYPE "DocumentType" ADD VALUE 'ORACLE_UPLOAD';

ALTER TABLE "Supplier"
  ADD COLUMN "erpIntegration" "SupplierErpIntegration";

ALTER TABLE "Invoice"
  ADD COLUMN "asateelRunId" TEXT,
  ADD COLUMN "asateelStatus" "AsateelRunStatus",
  ADD COLUMN "asateelQueuePosition" INTEGER,
  ADD COLUMN "asateelEmailSent" BOOLEAN,
  ADD COLUMN "asateelError" TEXT,
  ADD COLUMN "asateelRegion" "AsateelRegion",
  ADD COLUMN "asateelFolderName" TEXT,
  ADD COLUMN "asateelTriggeredAt" TIMESTAMP(3),
  ADD COLUMN "asateelStartedAt" TIMESTAMP(3),
  ADD COLUMN "asateelFinishedAt" TIMESTAMP(3),
  ADD COLUMN "asateelLastPolledAt" TIMESTAMP(3),
  ADD COLUMN "asateelOracleDocumentId" TEXT;

CREATE UNIQUE INDEX "Invoice_asateelRunId_key" ON "Invoice"("asateelRunId");
CREATE INDEX "Invoice_asateelStatus_idx" ON "Invoice"("asateelStatus");
