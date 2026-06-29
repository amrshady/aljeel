-- Seed suppliers for dev/testing tenant isolation
INSERT INTO "Supplier" ("id", "legalName", "status", "defaultCurrency", "updatedAt")
VALUES
  ('supplier_a', 'Supplier A LLC', 'ACTIVE', 'SAR', NOW()),
  ('supplier_b', 'Supplier B LLC', 'ACTIVE', 'SAR', NOW())
ON CONFLICT ("id") DO NOTHING;
