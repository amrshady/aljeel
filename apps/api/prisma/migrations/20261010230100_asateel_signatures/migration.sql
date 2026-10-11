-- Asateel signatures: inbound/outbound areas, signer routes, per-invoice signatures.
-- Signers and routes follow Abdul Ghaffar's 7 Oct 2026 email:
-- outbound is Waleed Kobessy; inbound Riyadh (Main) is Reda Abdelshafy,
-- East (Jed.) is Shakeer Shaik, West (Dam.) is Hussain Al Ghadeer.
-- Abdul Ghaffar Ahmed signs second for every area.

-- The region change rewrites "Invoice"; give up rather than queue behind live traffic.
SET lock_timeout = '10s';

ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'AWAITING_SIGNATURE';

-- Eastern and Western each split into outbound and inbound. Existing batches had no
-- direction, so they become outbound. The engine still receives EASTERN or WESTERN.
CREATE TYPE "AsateelRegion_new" AS ENUM (
  'CENTRAL',
  'PT_PROJECT',
  'EASTERN_OUTBOUND',
  'EASTERN_INBOUND',
  'WESTERN_OUTBOUND',
  'WESTERN_INBOUND',
  'MAIN'
);

ALTER TABLE "Invoice"
  ALTER COLUMN "asateelRegion" TYPE "AsateelRegion_new"
  USING (
    CASE "asateelRegion"::text
      WHEN 'EASTERN' THEN 'EASTERN_OUTBOUND'
      WHEN 'WESTERN' THEN 'WESTERN_OUTBOUND'
      ELSE "asateelRegion"::text
    END
  )::"AsateelRegion_new";

DROP TYPE "AsateelRegion";
ALTER TYPE "AsateelRegion_new" RENAME TO "AsateelRegion";

CREATE TABLE "AsateelSignerRoute" (
    "id" TEXT NOT NULL,
    "region" "AsateelRegion",
    "stage" INTEGER NOT NULL,
    "signerEmail" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AsateelSignerRoute_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AsateelSignerRoute_stage_check" CHECK ("stage" IN (1, 2))
);

CREATE INDEX "AsateelSignerRoute_region_stage_idx" ON "AsateelSignerRoute"("region", "stage");
CREATE INDEX "AsateelSignerRoute_signerEmail_idx" ON "AsateelSignerRoute"("signerEmail");
CREATE UNIQUE INDEX "AsateelSignerRoute_stage1_key"
  ON "AsateelSignerRoute"("region", "stage")
  WHERE "region" IS NOT NULL;
CREATE UNIQUE INDEX "AsateelSignerRoute_stage2_key"
  ON "AsateelSignerRoute"("stage")
  WHERE "region" IS NULL;

CREATE TABLE "AsateelInvoiceSignature" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "invoiceNo" TEXT NOT NULL,
    "approvalStepId" TEXT NOT NULL,
    "signedById" TEXT,
    "signedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AsateelInvoiceSignature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AsateelInvoiceSignature_invoiceId_invoiceNo_key"
  ON "AsateelInvoiceSignature"("invoiceId", "invoiceNo");
CREATE INDEX "AsateelInvoiceSignature_approvalStepId_idx"
  ON "AsateelInvoiceSignature"("approvalStepId");

ALTER TABLE "AsateelInvoiceSignature"
  ADD CONSTRAINT "AsateelInvoiceSignature_invoiceId_fkey"
  FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AsateelInvoiceSignature"
  ADD CONSTRAINT "AsateelInvoiceSignature_approvalStepId_fkey"
  FOREIGN KEY ("approvalStepId") REFERENCES "ApprovalStep"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append the signer role to the existing staff check, keeping whatever roles it already allows.
DO $$
DECLARE
  def text;
  widened text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO def
  FROM pg_constraint
  WHERE conname = 'AppUser_role_check';

  IF def IS NULL OR def LIKE '%ASATEEL_SIGNER%' THEN
    RETURN;
  END IF;

  widened := regexp_replace(
    def,
    '::"UserRole"\]\)\)\)$',
    '::"UserRole", ''ASATEEL_SIGNER''::"UserRole"])))'
  );
  IF widened = def THEN
    RAISE EXCEPTION 'Could not widen AppUser_role_check: %', def;
  END IF;

  ALTER TABLE "AppUser" DROP CONSTRAINT "AppUser_role_check";
  EXECUTE format('ALTER TABLE "AppUser" ADD CONSTRAINT "AppUser_role_check" %s', widened);
END $$;

-- An existing account with another role must be handled by hand, not silently demoted.
DO $$
DECLARE
  clash text;
BEGIN
  SELECT string_agg(format('%s (%s)', "email", "role"), ', ') INTO clash
  FROM "AppUser"
  WHERE lower("email") IN (
    'wkobessy@aljeel.com',
    'halghadeer@aljeel.com',
    'sshaik@aljeel.com',
    'rabdelshafy@aljeel.com',
    'agahmed@aljeel.com'
  )
    AND "role"::text <> 'ASATEEL_SIGNER';

  IF clash IS NOT NULL THEN
    RAISE EXCEPTION 'Asateel signer emails already belong to other roles: %', clash;
  END IF;
END $$;

INSERT INTO "AppUser" ("id", "email", "fullName", "role", "isActive", "updatedAt")
VALUES
  ('app_wkobessy_aljeel', 'wkobessy@aljeel.com', 'Waleed Kobessy', 'ASATEEL_SIGNER', true, NOW()),
  ('app_halghadeer_aljeel', 'halghadeer@aljeel.com', 'Hussain Al Ghadeer', 'ASATEEL_SIGNER', true, NOW()),
  ('app_sshaik_aljeel', 'sshaik@aljeel.com', 'Shakeer Shaik', 'ASATEEL_SIGNER', true, NOW()),
  ('app_rabdelshafy_aljeel', 'rabdelshafy@aljeel.com', 'Reda Abdelshafy', 'ASATEEL_SIGNER', true, NOW()),
  ('app_agahmed_aljeel', 'agahmed@aljeel.com', 'Abdul Ghaffar Ahmed', 'ASATEEL_SIGNER', true, NOW())
ON CONFLICT ("email") DO UPDATE SET
  "fullName" = EXCLUDED."fullName",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = NOW()
WHERE "AppUser"."role" = 'ASATEEL_SIGNER';

INSERT INTO "AsateelSignerRoute" ("id", "region", "stage", "signerEmail", "isActive", "updatedAt")
VALUES
  ('asateel_route_central_outbound', 'CENTRAL', 1, 'wkobessy@aljeel.com', true, NOW()),
  ('asateel_route_pt_outbound', 'PT_PROJECT', 1, 'wkobessy@aljeel.com', true, NOW()),
  ('asateel_route_eastern_outbound', 'EASTERN_OUTBOUND', 1, 'wkobessy@aljeel.com', true, NOW()),
  ('asateel_route_eastern_inbound', 'EASTERN_INBOUND', 1, 'sshaik@aljeel.com', true, NOW()),
  ('asateel_route_western_outbound', 'WESTERN_OUTBOUND', 1, 'wkobessy@aljeel.com', true, NOW()),
  ('asateel_route_western_inbound', 'WESTERN_INBOUND', 1, 'halghadeer@aljeel.com', true, NOW()),
  ('asateel_route_main_inbound', 'MAIN', 1, 'rabdelshafy@aljeel.com', true, NOW()),
  ('asateel_route_stage2', NULL, 2, 'agahmed@aljeel.com', true, NOW())
ON CONFLICT ("id") DO UPDATE SET
  "region" = EXCLUDED."region",
  "stage" = EXCLUDED."stage",
  "signerEmail" = EXCLUDED."signerEmail",
  "isActive" = EXCLUDED."isActive",
  "updatedAt" = NOW();

RESET lock_timeout;
