DROP INDEX "Invoice_supplierId_invoiceNumber_key";

CREATE UNIQUE INDEX "Invoice_supplierId_invoiceNumber_key"
ON "Invoice"("supplierId", "invoiceNumber")
WHERE "archivedAt" IS NULL;
