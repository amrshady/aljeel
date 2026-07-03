-- Seed suppliers for dev/testing tenant isolation
INSERT INTO "Supplier" ("id", "legalName", "status", "defaultCurrency", "updatedAt")
VALUES
  ('supplier_a', 'Supplier A LLC', 'ACTIVE', 'SAR', NOW()),
  ('supplier_b', 'Supplier B LLC', 'ACTIVE', 'SAR', NOW())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "Supplier" (
  "id",
  "legalName",
  "crNumber",
  "vatNumber",
  "status",
  "defaultCurrency",
  "erpVendorId",
  "erpIntegration",
  "updatedAt"
)
VALUES (
  'supplier_asateel',
  'Asateel Integrated Supplier LLC',
  'CR-ASATEEL-001',
  'VAT-ASATEEL-001',
  'ACTIVE',
  'SAR',
  'ASATEEL-001',
  'ASATEEL',
  NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "erpVendorId" = EXCLUDED."erpVendorId",
  "erpIntegration" = EXCLUDED."erpIntegration",
  "updatedAt" = NOW();

INSERT INTO "SupplierUser" (
  "id",
  "supplierId",
  "email",
  "fullName",
  "role",
  "mfaEnabled",
  "isActive"
)
VALUES
  ('user_supplier_admin', 'supplier_a', 'admin@supplier-a.com', 'Supplier A Admin', 'SUPPLIER_ADMIN', true, true),
  ('user_supplier_b', 'supplier_b', 'admin@supplier-b.com', 'Supplier B Admin', 'SUPPLIER_ADMIN', true, true),
  ('user_supplier_asateel', 'supplier_asateel', 'amr+asateel@accordpartners.ai', 'Asateel Admin', 'SUPPLIER_ADMIN', true, true)
ON CONFLICT ("id") DO UPDATE SET
  "supplierId" = EXCLUDED."supplierId",
  "email" = EXCLUDED."email",
  "fullName" = EXCLUDED."fullName",
  "role" = EXCLUDED."role",
  "mfaEnabled" = EXCLUDED."mfaEnabled",
  "isActive" = EXCLUDED."isActive";

INSERT INTO "AppUser" (
  "id",
  "email",
  "fullName",
  "role",
  "isActive",
  "updatedAt"
)
VALUES (
  'user_ap_clerk',
  'amr+apadmin@accordpartners.ai',
  'Aljeel AP Admin',
  'AP_CLERK',
  true,
  NOW()
)
ON CONFLICT ("id") DO UPDATE SET
  "email" = EXCLUDED."email",
  "fullName" = EXCLUDED."fullName",
  "role" = EXCLUDED."role",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = NOW();
