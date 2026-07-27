CREATE TYPE "PtResolutionMode" AS ENUM ('AGENCY', 'SALESMAN');
CREATE TYPE "PtAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'IMPORT', 'REGENERATE');

CREATE TABLE "PtAgencyMapping" (
    "id" TEXT NOT NULL,
    "agencyName" TEXT NOT NULL,
    "managerName" TEXT,
    "managerEmpNo" TEXT,
    "resolutionMode" "PtResolutionMode" NOT NULL,
    "agencyCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,
    CONSTRAINT "PtAgencyMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PtSalesmanMapping" (
    "id" TEXT NOT NULL,
    "agencyMappingId" TEXT NOT NULL,
    "lineHeadName" TEXT NOT NULL,
    "lineHeadEmpNo" TEXT NOT NULL,
    "salesmanName" TEXT NOT NULL,
    "salesmanEmpNo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT NOT NULL,
    CONSTRAINT "PtSalesmanMapping_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PtMappingAudit" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "PtAuditAction" NOT NULL,
    "field" TEXT NOT NULL,
    "oldValue" JSONB,
    "newValue" JSONB,
    "actorId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PtMappingAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PtAgencyMapping_agencyName_key" ON "PtAgencyMapping"("agencyName");
CREATE UNIQUE INDEX "PtAgencyMapping_agencyCode_key" ON "PtAgencyMapping"("agencyCode");
CREATE INDEX "PtAgencyMapping_resolutionMode_idx" ON "PtAgencyMapping"("resolutionMode");
CREATE UNIQUE INDEX "PtSalesmanMapping_salesmanEmpNo_key" ON "PtSalesmanMapping"("salesmanEmpNo");
CREATE UNIQUE INDEX "PtSalesmanMapping_agencyMappingId_lineHeadEmpNo_salesmanEmpNo_key" ON "PtSalesmanMapping"("agencyMappingId", "lineHeadEmpNo", "salesmanEmpNo");
CREATE INDEX "PtSalesmanMapping_agencyMappingId_lineHeadEmpNo_idx" ON "PtSalesmanMapping"("agencyMappingId", "lineHeadEmpNo");
CREATE INDEX "PtMappingAudit_entityType_entityId_createdAt_idx" ON "PtMappingAudit"("entityType", "entityId", "createdAt");
CREATE INDEX "PtMappingAudit_createdAt_idx" ON "PtMappingAudit"("createdAt");

ALTER TABLE "PtSalesmanMapping" ADD CONSTRAINT "PtSalesmanMapping_agencyMappingId_fkey"
FOREIGN KEY ("agencyMappingId") REFERENCES "PtAgencyMapping"("id") ON DELETE CASCADE ON UPDATE CASCADE;
