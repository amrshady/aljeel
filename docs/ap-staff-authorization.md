# AP staff authorization and production runbook

`AP_STAFF` is an internal, tenant-unscoped intake role. It can use the dashboard,
invoice intake tools, and invoice documents. It cannot use the Review Queue or
P&T Mapping. `AP_CLERK` and `AP_APPROVER` remain the privileged review roles.

## Authorization map

### Backend decorators

| Controller             | Routes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Roles after this change                                                  | Decision                                                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ApController`         | `POST /ap/solventum/chargeback`, `POST /ap/solventum/chargeback/jobs`, `GET /ap/solventum/chargeback/jobs/:jobId`, `GET /ap/solventum/chargeback/jobs/:jobId/result`, `POST /ap/supplier-reconciliation`                                                                                                                                                                                                                                                                                                                                                                                                       | `AP_STAFF`, `AP_CLERK`                                                   | Existing clerk-only intake/tools expanded to limited staff.                                                                                                                   |
| `ApController`         | `GET /ap/exceptions`, `GET /ap/invoices/:id`, `POST /ap/invoices/:id/approve`, `GET /ap/invoices/:id/reconciliation`, `POST /ap/invoices/:id/reconciliation/rerun`, `POST /ap/invoices/:id/reject`, `POST /ap/invoices/:id/hold`, `POST /ap/invoices/:id/resume`, `PATCH /ap/invoices/:id/folder-name`                                                                                                                                                                                                                                                                                                         | `AP_CLERK`, `AP_APPROVER`                                                | Retained. This is the Review Queue API; `AP_STAFF` is excluded.                                                                                                               |
| `PtMappingsController` | `GET /ap/pt-mappings`, `GET /ap/pt-mappings/audit`, `POST /ap/pt-mappings/validate`, `POST /ap/pt-mappings/regenerate`, `POST /ap/pt-mappings/resolve`, `POST /ap/pt-mappings/agencies`, `PATCH /ap/pt-mappings/agencies/:id`, `DELETE /ap/pt-mappings/agencies/:id`, `POST /ap/pt-mappings/agencies/:agencyId/salesmen`, `PATCH /ap/pt-mappings/salesmen/:id`, `DELETE /ap/pt-mappings/salesmen/:id`, `PATCH /ap/pt-mappings/agencies/:agencyId/line-heads/:empNo`, `DELETE /ap/pt-mappings/agencies/:agencyId/line-heads/:empNo`, `POST /ap/pt-mappings/import/preview`, `POST /ap/pt-mappings/import/apply` | `AP_CLERK`, `AP_APPROVER`                                                | Changed from clerk-only to both privileged roles; `AP_STAFF` is excluded.                                                                                                     |
| `InvoicesController`   | `POST /invoices`, `GET /invoices`, `PATCH /invoices/:id/asateel-region`, `POST /invoices/:id/submit`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `SUPPLIER_ADMIN`, `SUPPLIER_USER`, `AP_STAFF`, `AP_CLERK`                | Existing intake access expanded to limited staff.                                                                                                                             |
| `InvoicesController`   | `GET /invoices/:id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `SUPPLIER_ADMIN`, `SUPPLIER_USER`, `AP_STAFF`                            | Limited staff can open general invoice/document detail without receiving Review Queue detail.                                                                                 |
| `InvoicesController`   | `GET /invoices/summary`, `PUT /invoices/:id`, `POST /invoices/:id/archive`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `SUPPLIER_ADMIN`, `SUPPLIER_USER`                                        | Retained supplier-only.                                                                                                                                                       |
| `DocumentsController`  | All eleven document routes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | `SUPPLIER_ADMIN`, `SUPPLIER_USER`, `AP_STAFF`, `AP_CLERK`, `AP_APPROVER` | Existing document access expanded to limited staff. Routes cover upload URL/complete/multipart, archive/list, download/content, email preview/attachment, rename, and delete. |
| `SuppliersController`  | `GET /suppliers/me`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `SUPPLIER_ADMIN`, `SUPPLIER_USER`                                        | Retained supplier-only.                                                                                                                                                       |

### Programmatic backend checks

- `IdentityService.AP_STAFF_ROLES` contains `AP_STAFF`, `AP_CLERK`, and
  `AP_APPROVER`. SupplierUser lookup still runs before AppUser lookup, which
  still runs before the staff-domain fallback.
- `TenantGuard.INTERNAL_ROLES` contains `AP_STAFF`; therefore the role passes
  `@SupplierScoped()` without a supplier ID and `getSupplierScope()` returns
  `null`.
- `InvoicesService.isApIntakeUser` recognizes `AP_STAFF` and `AP_CLERK` for
  supplier integration resolution and cross-supplier intake access. The old
  AP-clerk checks at draft audit serialization, list, supplier-context
  resolution, and general invoice lookup now use this predicate.
- `DocumentsService.AP_ROLES` contains `AP_STAFF`, so its existing AP document
  visibility and mutation checks treat limited staff as internal.
- The global `RolesGuard` remains unchanged and requires an exact role listed
  by each decorator.

### Web navigation and route guards

- The app-shell Review Queue and P&T Mapping links render only for
  `AP_CLERK`/`AP_APPROVER`; neither link renders for `AP_STAFF`.
- `/[locale]/ap/review` remains guarded by `AP_CLERK`/`AP_APPROVER`.
- `/[locale]/ap/pt-mappings` is guarded by `AP_CLERK`/`AP_APPROVER` (expanded
  from clerk-only).
- Unauthorized client-side access follows the existing `RequireRole` pattern
  and redirects to `/dashboard`.
- `AP_STAFF` receives the internal intake dashboard and invoice-upload flow.
  Invoice detail uses `GET /invoices/:id`, not the privileged
  `GET /ap/invoices/:id`; review actions, reconciliation, and folder rename are
  not rendered for `AP_STAFF`. General document controls remain available.

## Production steps (documented only; do not run as part of this change)

1. Rebuild `@aljeel/shared-types` before API/web typecheck or build:

   ```bash
   pnpm --filter @aljeel/shared-types build
   ```

2. Add the enum value and widen the existing database check constraint. This
   repository intentionally contains no migration for this operational change.
   Run the enum statement separately before the transaction so the new enum
   value is committed before it is used:

   ```sql
   ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'AP_STAFF';

   BEGIN;
   ALTER TABLE "AppUser" DROP CONSTRAINT IF EXISTS "AppUser_role_check";
   ALTER TABLE "AppUser"
     ADD CONSTRAINT "AppUser_role_check"
     CHECK ("role" IN ('AP_STAFF', 'AP_CLERK', 'AP_APPROVER'));
   COMMIT;
   ```

3. Upsert every confirmed full-access identity as `AP_CLERK`. The display names
   below deliberately use the exact known email/local-part where the repository
   has no authoritative human name. `amr+asateel@accordpartners.ai` currently
   exists as a `SupplierUser`; because that lookup takes precedence over
   `AppUser`, remove that supplier identity in the same transaction before
   provisioning it as a clerk.

   ```sql
   BEGIN;

   DELETE FROM "SupplierUser"
   WHERE "email" = 'amr+asateel@accordpartners.ai';

   INSERT INTO "AppUser" ("id", "email", "fullName", "role", "isActive", "updatedAt")
   VALUES
     ('app_ahmed_samy_myregent', 'ahmed.samy@myregent.ai', 'Ahmed Samy', 'AP_CLERK', true, NOW()),
     ('app_amr_accordpartners', 'amr@accordpartners.ai', 'Amr', 'AP_CLERK', true, NOW()),
     ('user_ap_clerk', 'amr+apadmin@accordpartners.ai', 'Aljeel AP Admin', 'AP_CLERK', true, NOW()),
     ('app_amr_asateel_accordpartners', 'amr+asateel@accordpartners.ai', 'Asateel Admin', 'AP_CLERK', true, NOW()),
     ('app_ljaradat_aljeel', 'ljaradat@aljeel.com', 'ljaradat', 'AP_CLERK', true, NOW()),
     ('app_mlabadi_aljeel', 'mlabadi@aljeel.com', 'mlabadi', 'AP_CLERK', true, NOW()),
     ('app_qmohammad_aljeel', 'qmohammad@aljeel.com', 'qmohammad', 'AP_CLERK', true, NOW()),
     ('app_ealburaym_aljeel', 'ealburaym@aljeel.com', 'ealburaym', 'AP_CLERK', true, NOW()),
     ('app_ralanazi_aljeel', 'ralanazi@aljeel.com', 'ralanazi', 'AP_CLERK', true, NOW())
   ON CONFLICT ("email") DO UPDATE SET
     "fullName" = EXCLUDED."fullName",
     "role" = EXCLUDED."role",
     "isActive" = EXCLUDED."isActive",
     "updatedAt" = NOW();

   COMMIT;
   ```

   Repository evidence confirms only `ahmed.samy@myregent.ai` for Ahmed, and
   `amr@accordpartners.ai`, `amr+apadmin@accordpartners.ai`, and
   `amr+asateel@accordpartners.ai` for Amr. No other Ahmed or Amr aliases are
   present in repository provisioning/config. Before go-live, export the
   already-provisioned aliases from the external identity provider, add one
   `AP_CLERK` AppUser row per missing alias, and transfer any alias that already
   exists in `SupplierUser`; do not infer alias spellings.

   After the complete Ahmed/Amr alias allowlist is known, review every existing
   privileged row before changing it:

   ```sql
   SELECT "id", "email", "role", "isActive"
   FROM "AppUser"
   WHERE "isActive" = true
     AND "role" IN ('AP_CLERK', 'AP_APPROVER')
   ORDER BY "email";
   ```

   Any active privileged identity outside the complete approved allowlist must
   be changed to `AP_STAFF` (for an Aljeel user who should retain general app
   access) or deactivated (for an identity that should have no app access).
   This audit is required for the word “exactly” in the access requirement;
   repository code cannot prove what rows already exist in production.

4. Set the production API environment value and restart through the normal
   approved release process:

   ```dotenv
   AUTH_STAFF_DEFAULT_ROLE=AP_STAFF
   ```

   Keep `AUTH_STAFF_DOMAIN=aljeel.com`. Explicit active SupplierUser/AppUser
   rows continue to take precedence over this fallback.

No deploy, redeploy script, Prisma migration, or database write is part of this
change set.
