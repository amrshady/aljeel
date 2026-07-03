Implemented the Asateel approve-to-reconcile flow. No deploy and no DB migration was run.

**What Changed**
- Added Prisma enums/fields for:
  - `SupplierErpIntegration`
  - `AsateelRegion`
  - `AsateelRunStatus`
  - `DocumentType.ORACLE_UPLOAD`
  - per-invoice Asateel run tracking columns
- Added migration: `apps/api/prisma/migrations/20260703000000_asateel_integration/migration.sql`
- Seed now idempotently creates/marks `supplier_asateel` as `erpIntegration=ASATEEL`.
- Added `AsateelIntegrationService`:
  - stages invoice docs into `<ASATEEL_BATCHES_ROOT>/asateel-<invoiceNumber>/src`
  - posts to `POST /asateel/run`
  - polls every 45s
  - handles `DONE`, `FAILED`, `STATUS_LOST`, and `DONE + email_sent=false`
  - ingests the Oracle upload workbook as `ORACLE_UPLOAD`
- AP approve now dispatches Asateel async after approval commits.
- Added AP-only endpoints:
  - `GET /ap/invoices/:id/reconciliation`
  - `POST /ap/invoices/:id/reconciliation/rerun`
- Supplier document list/download/preview excludes `ORACLE_UPLOAD`.
- AP invoice detail now shows an Asateel status panel with polling, re-run, and Oracle download.
- Supplier upload form now persists an Asateel region fallback on invoice creation.
- Added env template entries for `ASATEEL_TRIGGER_KEY`, `ASATEEL_API_BASE`, `ASATEEL_BATCHES_ROOT`.

**Migration SQL**
```sql
CREATE TYPE "SupplierErpIntegration" AS ENUM ('ASATEEL', 'JAWAL');
CREATE TYPE "AsateelRegion" AS ENUM ('CENTRAL', 'PROJECTS', 'ADMIN');
CREATE TYPE "AsateelRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED', 'STATUS_LOST');

ALTER TYPE "DocumentType" ADD VALUE 'ORACLE_UPLOAD';

ALTER TABLE "Supplier" ADD COLUMN "erpIntegration" "SupplierErpIntegration";

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
```

**Verification**
- `pnpm --filter @aljeel/shared-types typecheck`
- `pnpm --filter @aljeel/api typecheck`
- `pnpm --filter @aljeel/web typecheck`
- `pnpm --filter @aljeel/shared-types test`
- `pnpm --filter @aljeel/api test`
- `pnpm --filter @aljeel/web test`
- `pnpm --filter @aljeel/api lint`
- `pnpm --filter @aljeel/shared-types lint`
- `pnpm --filter @aljeel/web lint`

Web lint exits 0 but still reports pre-existing Next/workspace warnings and an existing `document-evidence-viewer.tsx` hook warning.

**Notes**
- I did not run Prisma migrate against a database.
- I did not call the Flask trigger API because `ASATEEL_TRIGGER_KEY` is not configured here.
- Pre-existing dirty files remain untouched, including `apps/api/src/auth/mock-auth.provider.ts`, `apps/api/prisma/seed-jawal.ts`, and `apps/api/prisma/cleanup-demo-folders.ts`.
- Added `lucide-react`; `pnpm-lock.yaml` changed accordingly, with some pnpm peer-resolution churn.

[status: done rc=0]
