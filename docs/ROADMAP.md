# Aljeel Supplier AP Portal — Delivery Roadmap

> **Purpose:** a sequenced, dependency-aware backlog where each task is scoped to roughly
> one PR / one agent run. Any model can pick the next unblocked task, follow its acceptance
> criteria, and produce a reviewable result. Read `AGENT_GUIDE.md` before starting.

## How to read this

- Tasks use IDs like `P1-E2-T3` = Phase 1 → Epic 2 → Task 3.
- **Status legend:** `[ ]` todo · `[~]` in progress · `[x]` done · `[!]` blocked.
- Each task lists **Depends on**, **Deliverables**, and **Done when** (acceptance criteria).
- Keep tasks small. If a task feels larger than ~1 day of focused work, split it and note
  the split here.
- Update the status checkbox and add the PR link when you finish a task.

## Status board (high level)

| Phase | Theme | Status |
|---|---|---|
| Phase 0 | Foundations & scaffolding | `[ ]` |
| Phase 1 | MVP: onboarding + manual invoice + dashboard | `[ ]` |
| Phase 2 | Automation: OCR, matching, workflow, ZATCA | `[ ]` |
| Phase 3 | Tier‑1 polish: analytics, reconciliation, fraud, PWA | `[ ]` |

---

# Phase 0 — Foundations & Scaffolding

Goal: a runnable monorepo with CI, auth shell, and a deployable "hello" slice end-to-end.

### Epic P0-E1 — Repository & Tooling
- `[ ]` **P0-E1-T1 — Monorepo scaffold.**
  - Deliverables: pnpm/turbo workspace with `apps/web`, `apps/api`, `packages/shared-types`,
    `packages/ui`, `packages/config`, `workers/`, `infra/` per `ARCHITECTURE.md §8`.
  - Done when: `pnpm install` works; `pnpm build` and `pnpm lint` pass at root.
- `[ ]` **P0-E1-T2 — Shared config presets.** ESLint, Prettier, TS base config, Tailwind preset.
  - Depends on: P0-E1-T1. Done when: all apps extend shared presets; lint passes.
- `[ ]` **P0-E1-T3 — CI pipeline.** GitHub Actions: install, lint, typecheck, test, build.
  - Done when: CI runs on PR and is green on the scaffold.
- `[ ]` **P0-E1-T4 — Local dev env.** `docker-compose` for PostgreSQL, Redis, RabbitMQ, MinIO.
  - Done when: `docker compose up` starts all services; documented in README.

### Epic P0-E2 — Backend Skeleton
- `[ ]` **P0-E2-T1 — NestJS app bootstrap.** Health endpoint `/api/v1/health`, config module,
  structured logging, error envelope, OpenAPI/Swagger setup.
  - Depends on: P0-E1-T1. Done when: `/health` returns 200; Swagger UI renders.
- `[ ]` **P0-E2-T2 — Prisma + migrations.** Wire Prisma to PG; commit reference schema from
  `DATA_MODEL.md`; first migration.
  - Depends on: P0-E1-T4. Done when: `prisma migrate dev` creates all tables.
- `[ ]` **P0-E2-T3 — Queue abstraction.** Publisher/consumer interface over RabbitMQ with a
  no-op worker example, retries + dead-letter.
  - Done when: a test job round-trips through the queue.
- `[ ]` **P0-E2-T4 — Audit + idempotency middleware.** Append-only `AuditEvent` writer and
  `Idempotency-Key` interceptor.
  - Depends on: P0-E2-T2. Done when: audit rows written on writes; duplicate keys return cached result.

### Epic P0-E3 — Frontend Skeleton
- `[ ]` **P0-E3-T1 — Next.js app bootstrap.** App Router, Tailwind + shadcn/ui, base layout,
  theme.
  - Depends on: P0-E1-T2. Done when: app builds and renders a styled landing page.
- `[ ]` **P0-E3-T2 — i18n + RTL.** `i18next`/`next-intl`, English + Arabic, `dir` switching,
  logical CSS.
  - Done when: language toggle flips LTR/RTL and translates the shell.
- `[ ]` **P0-E3-T3 — API client + data layer.** TanStack Query, typed client from
  `shared-types`, error handling, auth token plumbing.
  - Done when: app fetches `/health` and shows status.

### Epic P0-E4 — Identity & Access
- `[ ]` **P0-E4-T1 — Auth provider integration.** Keycloak (or Azure AD B2C) OIDC; login,
  refresh, logout; MFA enforced.
  - Done when: a user can log in with MFA and receive tokens.
- `[ ]` **P0-E4-T2 — RBAC + tenant isolation.** Roles enum, global guard injecting supplier
  scope, repository-level `supplierId` filter.
  - Depends on: P0-E2-T2, P0-E4-T1. Done when: a supplier cannot read another supplier's row
    (covered by a test).
- `[ ]` **P0-E4-T3 — Protected routing (web).** Auth context, route guards, role-based menu.
  - Depends on: P0-E3-T3, P0-E4-T1.

---

# Phase 1 — MVP

Goal: suppliers onboard, upload an invoice manually, and track status; AP can review and
move it through the lifecycle; ERP vendor/PO read-sync works.

### Epic P1-E1 — Supplier Onboarding
- `[ ]` **P1-E1-T1 — Supplier + SupplierUser CRUD APIs.** `/suppliers/me`, sub-user invite.
  - Depends on: P0-E4-T2.
- `[ ]` **P1-E1-T2 — Self-registration flow (API).** Invite token, `/onboarding/register`,
  KYC doc upload to object storage.
- `[ ]` **P1-E1-T3 — Bank account maker-checker (API).** Add bank account → PENDING;
  vendor-master verify endpoint; second-channel alert hook.
  - Done when: new/changed bank details never become active without a second approver.
- `[ ]` **P1-E1-T4 — Duplicate vendor detection.** Block on matching CR/VAT/IBAN.
- `[ ]` **P1-E1-T5 — Onboarding UI.** Multi-step registration wizard + document upload + status.
  - Depends on: P1-E1-T2, P0-E3-T3.
- `[ ]` **P1-E1-T6 — Supplier profile UI.** View/edit profile, manage users, manage bank
  accounts (with maker-checker state shown).

### Epic P1-E2 — ERP Read-Sync (vendors, POs, GRNs)
- `[ ]` **P1-E2-T1 — ERP connector interface + mock.** Pluggable connector; mock returns
  sample vendors/POs/GRNs for dev.
  - Done when: sync job populates POs for a test supplier from the mock.
- `[ ]` **P1-E2-T2 — PO read APIs + UI.** `/purchase-orders` list/detail; supplier PO browser.
  - Depends on: P1-E2-T1.
- `[ ]` **P1-E2-T3 — Reconciliation job.** Scheduled sync with retry/dead-letter + a
  reconciliation report of mismatches.

### Epic P1-E3 — Manual Invoice Submission
- `[ ]` **P1-E3-T1 — Invoice draft API.** Create/update draft, lines, totals.
  - Depends on: P0-E2-T2.
- `[x]` **P1-E3-T2 — Document upload API.** Multipart upload to `POST /invoices/:id/documents`
  (local-disk `StorageService`, S3-swappable), register `Document`, size/type allowlist,
  list/download/delete, virus-scan status placeholder (set `CLEAN` in dev). Supplier-scoped
  ownership enforced.
- `[ ]` **P1-E3-T3 — Invoice lifecycle FSM.** Implement state machine + transitions per
  `ARCHITECTURE.md §4`; guard illegal transitions.
- `[ ]` **P1-E3-T4 — Basic validation on submit.** Duplicate-invoice check, VAT math
  validation, currency/PO consistency.
  - Done when: invalid invoices are rejected with clear field-level errors.
- `[ ]` **P1-E3-T5 — Submit endpoint.** `/invoices/{id}/submit` → SUBMITTED/UNDER_REVIEW.
  - Depends on: P1-E3-T3, P1-E3-T4.
- `[~]` **P1-E3-T6 — Submission UI.** Drag-drop upload + attachments list done (new-invoice
  form and invoice detail page); PDF preview, PO linkage, and draft auto-save still pending.
  - Depends on: P1-E3-T1..T5.

### Epic P1-E4 — Supplier Dashboard & Status
- `[ ]` **P1-E4-T1 — Invoice list API.** Filters, search, pagination, export.
- `[ ]` **P1-E4-T2 — Invoice detail + timeline API.** Status history from audit/approval data.
- `[ ]` **P1-E4-T3 — Dashboard UI.** Status pipeline, filters, search, export, empty/loading states.
- `[ ]` **P1-E4-T4 — Invoice detail UI.** Timeline, documents, rejection reasons, resubmit flow.

### Epic P1-E5 — AP Review (internal)
- `[ ]` **P1-E5-T1 — Exception queue API.** `/ap/exceptions` for invoices needing review.
- `[ ]` **P1-E5-T2 — Approve/reject/hold APIs.** Records `ApprovalStep` + audit + status change.
- `[ ]` **P1-E5-T3 — AP review UI.** Queue, side-by-side document + data, action buttons,
  reason capture.

### Epic P1-E6 — Notifications (MVP)
- `[ ]` **P1-E6-T1 — Notification service + email.** Templated bilingual email via provider;
  in-app notification records.
- `[ ]` **P1-E6-T2 — Trigger wiring.** Emit on: submitted, rejected, approved, status change.
- `[ ]` **P1-E6-T3 — Notifications UI + live updates.** Notification center + SSE/WebSocket.

**Phase 1 exit criteria:** an external supplier can register, get approved, upload an
invoice, and watch it go `Submitted → Under Review → Approved`; AP can action it; emails fire;
all changes audited; multi-tenant isolation verified by tests.

---

# Phase 2 — Automation

Goal: minimize human touch. OCR pre-fills invoices, 3-way matching auto-approves clean ones,
configurable approval workflow handles the rest, ZATCA compliance for e-invoices.

### Epic P2-E1 — OCR / IDP
- `[ ]` **P2-E1-T1 — OCR provider abstraction + worker.** Pluggable provider (Azure DI/Textract);
  queue-driven extraction; store `ocrData` + confidence on `Document`.
- `[ ]` **P2-E1-T2 — Field mapping + confidence UI.** Pre-fill smart form; highlight
  low-confidence fields for review.
- `[ ]` **P2-E1-T3 — Virus scanning.** Real AV scan on upload; block on infected.
- `[ ]` **P2-E1-T4 — Email-to-portal intake.** Inbound email → invoice draft with attribution.

### Epic P2-E2 — 3-Way Matching Engine
- `[ ]` **P2-E2-T1 — Tolerance config.** Admin-configurable price/qty/amount tolerances.
- `[ ]` **P2-E2-T2 — Matching worker.** PO ↔ GRN ↔ Invoice comparison → `matchResult` with
  reason codes.
- `[ ]` **P2-E2-T3 — Touchless auto-approval.** Within tolerance → APPROVED → SCHEDULED.
- `[ ]` **P2-E2-T4 — Exception routing.** Out of tolerance → UNDER_REVIEW with explicit
  exception list; surfaced in AP queue.
- `[ ]` **P2-E2-T5 — Non-PO invoice path.** GL coding UI + approval routing.

### Epic P2-E3 — Approval Workflow Engine
- `[ ]` **P2-E3-T1 — Rules engine.** Routing by amount/cost center/category/entity; DOA matrix.
- `[ ]` **P2-E3-T2 — Parallel/sequential + escalation.** SLA timers, escalation, OOO delegation.
- `[ ]` **P2-E3-T3 — Workflow designer UI.** Admin configures rules without code.

### Epic P2-E4 — Messaging & Richer Notifications
- `[ ]` **P2-E4-T1 — Invoice message thread (API + UI).** Two-way supplier ↔ AP per invoice.
- `[ ]` **P2-E4-T2 — SMS/WhatsApp channel.** Optional channel via Twilio/Unifonic.

### Epic P2-E5 — Payments & Remittance
- `[ ]` **P2-E5-T1 — Payment status sync (ERP outbound/inbound).** Post approved invoices to
  ERP; ingest payment status → SCHEDULED/PAID.
- `[ ]` **P2-E5-T2 — Remittance publishing.** Attach/generate remittance advice; supplier
  download.
- `[ ]` **P2-E5-T3 — Payment views UI.** Scheduled/paid, reference, remittance download.

### Epic P2-E6 — ZATCA / Fatoora Compliance
- `[ ]` **P2-E6-T1 — UBL/XML validation.** Validate e-invoice format on XML submissions.
- `[ ]` **P2-E6-T2 — Clearance/reporting integration.** Integrate with ZATCA sandbox;
  store QR/UUID/clearance status.
  - Note: confirm Aljeel's ZATCA obligations (as buyer vs supplier-driven) before building.

**Phase 2 exit criteria:** clean PO-backed invoices flow touchless to SCHEDULED; exceptions
route through a configurable workflow; OCR pre-fill ≥ target accuracy; ZATCA validation in place.

---

# Phase 3 — Tier‑1 Polish

Goal: the differentiators that make it best-in-class.

### Epic P3-E1 — Analytics & Reporting
- `[ ]` **P3-E1-T1 — Reporting APIs.** Aging, DPO, touchless rate, cycle-time, exceptions.
- `[ ]` **P3-E1-T2 — Dashboards UI.** Internal analytics dashboards + scheduled exports.
- `[ ]` **P3-E1-T3 — BI export.** Data feed to Power BI/Looker.
- `[ ]` **P3-E1-T4 — Supplier scorecards.** On-time submission, accuracy, dispute rate.

### Epic P3-E2 — Statement Reconciliation
- `[ ]` **P3-E2-T1 — Statement upload + match.** Supplier statement vs ledger; flag
  discrepancies for resolution.

### Epic P3-E3 — Early-Payment Discounts
- `[ ]` **P3-E3-T1 — Dynamic discounting.** Offer/accept early-payment discount terms.

### Epic P3-E4 — Fraud & Anomaly Detection
- `[ ]` **P3-E4-T1 — Bank-change anomaly detection.** Flag bank changes near payment runs;
  second-channel confirmation; risk scoring.

### Epic P3-E5 — Mobile PWA & Accessibility
- `[ ]` **P3-E5-T1 — PWA.** Installable, offline-aware status views.
- `[ ]` **P3-E5-T2 — Accessibility audit.** WCAG 2.1 AA pass (both LTR/RTL).

### Epic P3-E6 — Hardening & Compliance
- `[ ]` **P3-E6-T1 — Security review.** Pen test, SOC 2 / ISO 27001 control mapping.
- `[ ]` **P3-E6-T2 — DR drill.** Backup/restore test meeting RPO ≤ 15m / RTO ≤ 1h.
- `[ ]` **P3-E6-T3 — Load testing.** Month-end peak simulation; tune autoscaling.

**Phase 3 exit criteria:** analytics live, reconciliation usable, fraud controls active,
PWA + accessibility verified, security and DR validated.

---

## Cross-cutting Definition of Done (applies to every task)

1. Code + tests (unit; integration where it crosses a boundary).
2. Types shared via `packages/shared-types`; no `any` on public boundaries.
3. Lint, typecheck, and CI green.
4. Multi-tenant isolation respected and tested for any supplier-scoped data.
5. Audit events written for state changes; sensitive data never logged.
6. Bilingual (EN/AR) + RTL verified for any user-facing UI.
7. API changes reflected in OpenAPI + `docs/API.md`.
8. Docs/roadmap status updated; PR description links the task ID.

## Milestone summary (indicative)

| Milestone | Scope | Rough effort |
|---|---|---|
| M0 | Phase 0 complete (runnable skeleton, auth, CI) | 2–3 wks |
| M1 | Phase 1 MVP | 8–12 wks |
| M2 | Phase 2 automation | 8–12 wks |
| M3 | Phase 3 tier‑1 polish | 6–10 wks |
