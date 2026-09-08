CREATE TYPE "SolventumChargebackJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TABLE "SolventumChargebackJob" (
    "id" TEXT NOT NULL,
    "status" "SolventumChargebackJobStatus" NOT NULL DEFAULT 'PENDING',
    "podCount" INTEGER NOT NULL,
    "failedPodCount" INTEGER NOT NULL DEFAULT 0,
    "failedPodNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "workbookBytes" BYTEA NOT NULL,
    "podNames" TEXT[],
    "podBytes" BYTEA[],
    "resultBytes" BYTEA,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SolventumChargebackJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SolventumChargebackJob_status_createdAt_idx" ON "SolventumChargebackJob"("status", "createdAt");
CREATE INDEX "SolventumChargebackJob_createdAt_idx" ON "SolventumChargebackJob"("createdAt");
