# Aljeel Supplier AP Portal — API Contract

> REST conventions and representative endpoints. The API is the contract between
> `apps/web` and `apps/api`. Generate an OpenAPI spec from the implementation and keep it
> in sync. Shared request/response types live in `packages/shared-types` (Zod).

---

## 1. Conventions

- **Base path:** `/api/v1`
- **Format:** JSON; `Content-Type: application/json` (uploads use signed URLs / multipart).
- **Auth:** `Authorization: Bearer <access_token>` (OIDC). MFA enforced at login.
- **Tenancy:** supplier scope is derived from the token — clients never pass `supplierId`
  for their own data; the server enforces isolation.
- **Idempotency:** mutating requests accept `Idempotency-Key: <uuid>`.
- **Pagination:** `?page=1&pageSize=25` → response includes `{ data, page, pageSize, total }`.
- **Filtering/sorting:** `?status=&from=&to=&q=&sort=-createdAt`.
- **Errors:** consistent envelope:

```json
{
  "error": {
    "code": "INVOICE_DUPLICATE",
    "message": "An invoice with this number already exists.",
    "details": { "invoiceNumber": "INV-1024" },
    "traceId": "01HZX…"
  }
}
```

- **Standard codes:** `200/201` success, `400` validation, `401` unauth, `403` forbidden,
  `404` not found, `409` conflict (duplicate/idempotency), `422` business-rule violation,
  `429` rate limit, `5xx` server.

---

## 2. Auth & Identity

| Method | Path | Description |
|---|---|---|
| POST | `/auth/login` | Start session (email/password → MFA challenge) |
| POST | `/auth/mfa` | Verify MFA code → tokens |
| POST | `/auth/refresh` | Exchange refresh token |
| POST | `/auth/logout` | Revoke session |
| GET | `/auth/me` | Current user + role + supplier scope |

---

## 3. Supplier & Vendor Master

| Method | Path | Description |
|---|---|---|
| GET | `/suppliers/me` | Current supplier profile |
| PUT | `/suppliers/me` | Update profile (non-sensitive fields) |
| GET | `/suppliers/me/users` | List sub-users (Supplier Admin) |
| POST | `/suppliers/me/users` | Invite sub-user |
| GET | `/suppliers/me/bank-accounts` | List bank accounts |
| POST | `/suppliers/me/bank-accounts` | Add bank account → **maker-checker** (PENDING) |
| POST | `/onboarding/register` | Self-registration via invite token |
| POST | `/onboarding/documents` | Upload KYC docs |

> Internal vendor-master endpoints (`/ap/suppliers/{id}/approve`, `/bank-accounts/{id}/verify`)
> are restricted to `VENDOR_MASTER` role.

---

## 4. Purchase Orders (read, ERP-synced)

| Method | Path | Description |
|---|---|---|
| GET | `/purchase-orders?status=open` | Supplier's open POs |
| GET | `/purchase-orders/{id}` | PO detail with lines + receipts |

---

## 5. Invoices (core)

| Method | Path | Description |
|---|---|---|
| POST | `/invoices` | Create draft invoice |
| POST | `/invoices/{id}/documents` | **Implemented.** Multipart (`file` + `type`) upload; registers `Document`; type/size validated (PDF/image/XML, ≤ 25 MB) |
| GET | `/invoices/{id}/documents` | **Implemented.** List documents attached to an invoice |
| GET | `/documents/{id}/download` | **Implemented.** Stream a document file (attachment) |
| DELETE | `/documents/{id}` | **Implemented.** Remove a document from an editable invoice |
| GET | `/invoices/{id}/ocr` | OCR extraction result + per-field confidence (Phase 2) |
| PUT | `/invoices/{id}` | Update draft fields/lines |
| POST | `/invoices/{id}/submit` | Submit → runs dedup + VAT + ZATCA + 3-way match |
| GET | `/invoices` | List with filters/search/pagination |
| GET | `/invoices/{id}` | Full detail + status timeline |
| POST | `/invoices/{id}/messages` | Post message in invoice thread |
| GET | `/invoices/{id}/messages` | List thread |

> **Note on upload approach:** the current build uses **direct multipart upload** to the API
> (simple, works out-of-the-box in dev). The signed-URL-to-object-storage approach remains the
> target for large-scale production; `StorageService` already abstracts the storage backend so
> switching to S3/MinIO presigned uploads won't change the `Document` model or callers.

### Example: submit response (touchless)

```json
{
  "id": "inv_01HZX",
  "status": "SCHEDULED",
  "matchResult": { "type": "THREE_WAY", "withinTolerance": true },
  "scheduledPaymentDate": "2026-07-15"
}
```

### Example: submit response (exception)

```json
{
  "id": "inv_01HZY",
  "status": "UNDER_REVIEW",
  "matchResult": {
    "type": "THREE_WAY",
    "withinTolerance": false,
    "exceptions": [{ "code": "PRICE_VARIANCE", "poLineId": "pol_3", "variancePct": 8.2 }]
  }
}
```

---

## 6. Payments & Remittance

| Method | Path | Description |
|---|---|---|
| GET | `/payments?status=paid` | Payments visible to supplier |
| GET | `/payments/{id}` | Payment detail + allocations |
| GET | `/payments/{id}/remittance` | Signed download URL for remittance advice |
| GET | `/statements/reconciliation` | Supplier statement vs ledger comparison |

---

## 7. Notifications

| Method | Path | Description |
|---|---|---|
| GET | `/notifications` | List (unread first) |
| POST | `/notifications/{id}/read` | Mark read |
| GET | `/notifications/stream` | SSE/WebSocket for live updates |

---

## 8. Internal / AP Operations (role-gated)

| Method | Path | Description |
|---|---|---|
| GET | `/ap/exceptions` | Queue of invoices needing review |
| GET | `/ap/invoices/{id}` | Full invoice for processing |
| POST | `/ap/invoices/{id}/approve` | Approve (records ApprovalStep) |
| POST | `/ap/invoices/{id}/reject` | Reject with reason |
| POST | `/ap/invoices/{id}/hold` | Put on hold / request info |
| PUT | `/ap/invoices/{id}/coding` | GL coding for non-PO invoices |

---

## 9. Admin & Config

| Method | Path | Description |
|---|---|---|
| GET/PUT | `/admin/workflows` | Approval workflow rules |
| GET/PUT | `/admin/tolerances` | Matching tolerance config |
| GET/POST | `/admin/users` | Internal user/role management |
| GET | `/admin/audit` | Audit-event search |

---

## 10. Reporting

| Method | Path | Description |
|---|---|---|
| GET | `/reports/aging` | AP aging |
| GET | `/reports/touchless-rate` | Straight-through processing rate |
| GET | `/reports/cycle-time` | Intake → payment cycle |
| GET | `/reports/exceptions` | Exception-reason breakdown |

---

## 11. Integration (system-to-system)

- **Inbound webhooks from ERP:** PO created/updated, GRN posted, payment completed.
- **Outbound webhooks to subscribers:** `invoice.status.changed`, `payment.completed`.
- All webhook payloads are signed (HMAC) and idempotent.
