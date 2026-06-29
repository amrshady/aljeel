-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');
CREATE TYPE "UserRole" AS ENUM ('SUPPLIER_ADMIN', 'SUPPLIER_USER', 'AP_CLERK', 'AP_APPROVER', 'PROCUREMENT', 'TREASURY', 'VENDOR_MASTER', 'SYSTEM_ADMIN', 'AUDITOR');
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'ON_HOLD', 'REJECTED', 'SCHEDULED', 'PAID');
CREATE TYPE "InvoiceSource" AS ENUM ('UPLOAD', 'EMAIL', 'XML', 'BULK');
CREATE TYPE "DocumentType" AS ENUM ('INVOICE', 'DELIVERY_NOTE', 'GRN_COPY', 'CONTRACT', 'TIMESHEET', 'OTHER');
CREATE TYPE "ScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'FAILED');
CREATE TYPE "ApprovalAction" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HOLD');

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "crNumber" TEXT,
    "vatNumber" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'PENDING',
    "paymentTerms" TEXT,
    "defaultCurrency" TEXT NOT NULL DEFAULT 'SAR',
    "erpVendorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupplierUser" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SUPPLIER_USER',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "iban" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountHolder" TEXT NOT NULL,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedById" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "erpPoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PoLine" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "vatRate" DECIMAL(65,30) NOT NULL DEFAULT 15,

    CONSTRAINT "PoLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "receivedQty" DECIMAL(65,30) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "poId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "vat" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "total" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "source" "InvoiceSource" NOT NULL DEFAULT 'UPLOAD',
    "matchResult" JSONB,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "vatRate" DECIMAL(65,30) NOT NULL DEFAULT 15,
    "amount" DECIMAL(65,30) NOT NULL,
    "glCode" TEXT,
    "costCenter" TEXT,

    CONSTRAINT "InvoiceLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL DEFAULT 'INVOICE',
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "ocrData" JSONB,
    "virusScanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ApprovalStep" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "approverId" TEXT,
    "sequence" INTEGER NOT NULL,
    "action" "ApprovalAction" NOT NULL DEFAULT 'PENDING',
    "comment" TEXT,
    "slaDueAt" TIMESTAMP(3),
    "actedAt" TIMESTAMP(3),

    CONSTRAINT "ApprovalStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "remittanceDocKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PaymentAllocation" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IdempotencyRecord" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "status" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_crNumber_key" ON "Supplier"("crNumber");
CREATE UNIQUE INDEX "Supplier_vatNumber_key" ON "Supplier"("vatNumber");
CREATE UNIQUE INDEX "Supplier_erpVendorId_key" ON "Supplier"("erpVendorId");
CREATE UNIQUE INDEX "SupplierUser_email_key" ON "SupplierUser"("email");
CREATE INDEX "SupplierUser_supplierId_idx" ON "SupplierUser"("supplierId");
CREATE INDEX "BankAccount_supplierId_idx" ON "BankAccount"("supplierId");
CREATE UNIQUE INDEX "PurchaseOrder_erpPoId_key" ON "PurchaseOrder"("erpPoId");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE UNIQUE INDEX "PurchaseOrder_supplierId_poNumber_key" ON "PurchaseOrder"("supplierId", "poNumber");
CREATE INDEX "PoLine_poId_idx" ON "PoLine"("poId");
CREATE INDEX "GoodsReceipt_poId_idx" ON "GoodsReceipt"("poId");
CREATE INDEX "Invoice_supplierId_status_idx" ON "Invoice"("supplierId", "status");
CREATE UNIQUE INDEX "Invoice_supplierId_invoiceNumber_key" ON "Invoice"("supplierId", "invoiceNumber");
CREATE INDEX "InvoiceLine_invoiceId_idx" ON "InvoiceLine"("invoiceId");
CREATE INDEX "Document_invoiceId_idx" ON "Document"("invoiceId");
CREATE INDEX "ApprovalStep_invoiceId_idx" ON "ApprovalStep"("invoiceId");
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");
CREATE INDEX "PaymentAllocation_invoiceId_idx" ON "PaymentAllocation"("invoiceId");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Message_invoiceId_idx" ON "Message"("invoiceId");
CREATE INDEX "AuditEvent_entity_entityId_idx" ON "AuditEvent"("entity", "entityId");
CREATE UNIQUE INDEX "IdempotencyRecord_key_key" ON "IdempotencyRecord"("key");
CREATE INDEX "IdempotencyRecord_expiresAt_idx" ON "IdempotencyRecord"("expiresAt");

-- AddForeignKey
ALTER TABLE "SupplierUser" ADD CONSTRAINT "SupplierUser_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PoLine" ADD CONSTRAINT "PoLine_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Document" ADD CONSTRAINT "Document_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ApprovalStep" ADD CONSTRAINT "ApprovalStep_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
