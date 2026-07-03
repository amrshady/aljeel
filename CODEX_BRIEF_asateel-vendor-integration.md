# Codex Brief — Asateel Vendor-Platform Approve→Reconcile Integration

## Context
Monorepo at repo root (this --cd): NestJS API in `apps/api`, Next.js web in `apps/web`,
shared Zod/types in `packages/shared-types`. Prisma schema at
`apps/api/prisma/schema.prisma`. This droplet also runs a Flask app (the Asateel
reconciliation trigger API) on `http://127.0.0.1:5000`, sharing the filesystem.

The Asateel reconciliation trigger API contract is documented at:
- `/home/clawdbot/.openclaw/workspace/aljeel/docs/asateel-trigger-api.AGENT.md`
- `/home/clawdbot/.openclaw/workspace/aljeel/docs/asateel-trigger-api.openapi.yaml`
Read BOTH before coding. Key facts: `POST /asateel/run` (202, returns `run_id`,
`queue_position`), auth header `X-Asateel-Trigger-Key`, poll `GET /asateel/run/{run_id}`
(status: queued|running|done|failed, plus `email_sent`, `error`). Payload fields:
`archive_date` (YYYY-MM-DD), `folder_name`, `region` (CENTRAL|PROJECTS|ADMIN),
`batch_id` (non-empty, no path separators, trailing number drives output filenames),
`recipients` (optional). Pipeline writes outputs to
`/home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-<batch_id>/<Region>-<NN>-2026_Oracle-upload.xlsx`
and stages inputs from `batches/asateel-<batch_id>/src/`.

## Goal
When an AlJeel AP admin APPROVES an invoice whose supplier is Asateel-integrated, the
NestJS backend fires an Asateel reconciliation run, tracks its status async, ingests the
generated Oracle-upload file when done, and exposes an AP-only download button + status in
the AP invoice-detail UI. The vendor never sees run status or the Oracle file.

## LOCKED DECISIONS (build exactly these — do not redesign)
1. An Asateel "batch" IS an Invoice record. One approve = one run.
2. Trigger payload derivation:
   - `archive_date` = the date the invoice's documents were uploaded (use invoice
     createdAt / document createdAt date, formatted YYYY-MM-DD).
   - `folder_name` = the staged folder created in step (7) below.
   - `region` = parsed from the folder name (match CENTRAL|PROJECTS|ADMIN case-insensitive);
     if the parse is ambiguous/absent, fall back to a persisted vendor-selected region
     field on the invoice. Validate against the allowed set before firing.
   - `batch_id` = the invoice's `invoiceNumber` (e.g. AS26-014). Reject/skip firing with a
     clear error if it contains path separators.
3. Fires ONLY on the `approve` transition (into APPROVED). Never on reject/hold/resume.
   Fire exactly once — guard against double-fire if an already-APPROVED invoice is
   re-approved or if a run for this invoice is already queued/running.
4. Approve endpoint returns immediately. Reconciliation status is tracked async
   (queued→running→done/failed). Download button appears only when status=done.
5. Backend reads the Oracle file directly from the shared disk path, ingests it as a
   Document (new type e.g. ORACLE_UPLOAD) on the invoice, and re-serves it through the
   existing document-download route with AP-only role scoping. NO new Flask endpoint.
6. Same droplet. Read `ASATEEL_TRIGGER_KEY` and `ASATEEL_API_BASE`
   (default http://127.0.0.1:5000) from NestJS service env. Add both to the env
   template/example with comments; never hardcode the key.
7. On approve, BEFORE firing the run, materialize the invoice's uploaded documents from
   portal object storage (storageKey via the existing storage service) into
   `<ASATEEL_BATCHES_ROOT>/asateel-<batch_id>/src/`. Make the batches root configurable via
   env (default `/home/clawdbot/.openclaw/workspace/aljeel/batches`). `folder_name` = that
   staged folder path/name as the pipeline expects.
8. Add `erpIntegration` enum on Supplier (values: ASATEEL, JAWAL, and null/none;
   extensible). Approve handler dispatches on `supplier.erpIntegration === 'ASATEEL'`.
   Structure the dispatch so adding JAWAL later is a small switch addition.
9. Status + download live on the AP-side invoice detail only, hidden entirely from the
   supplier invoice view. Enforce AP role (AP_CLERK/AP_APPROVER) on both the status field
   exposure and the download route. The ORACLE_UPLOAD document type must be excluded from
   the supplier-facing document list.
10. Reconciliation failure (status=failed, or done+email_sent=false, or run_id 404
    "status lost") NEVER rolls back the APPROVED status. Show reconciliation state
    separately. Provide an AP-only "re-run" action. Handle the three cases:
    - done + email_sent=false → still ingest file + show download, badge "Completed — email failed".
    - failed → red badge with error string, invoice stays APPROVED, offer re-run.
    - 404 mid-run → "status lost — check ops / re-run", never treated as success.

## DELIVERABLES
### A. Prisma + migration + seed/admin
- Add `SupplierErpIntegration` enum + `erpIntegration` field on Supplier.
- Add reconciliation tracking to Invoice: run_id, run status enum, email_sent,
  error string, region (for fallback), and any timestamps you need. Prefer explicit
  columns; a single JSON `asateelRun` blob is acceptable if cleaner — your call, but
  document it.
- Add `ORACLE_UPLOAD` (or similar) to the DocumentType enum.
- Write the DB migration (prisma migrate).
- Write a seed / idempotent admin action that sets the Asateel supplier's
  erpIntegration=ASATEEL. If no obvious Asateel supplier exists in seed data, create/seed
  one clearly marked, and make the setter idempotent + re-runnable.

### B. Backend (NestJS)
- A dedicated service (e.g. AsateelIntegrationService or a generic ErpDispatch) that:
  stages docs → builds payload → POST /asateel/run → persists run_id/queue_position.
- Hook it into the existing AP approve flow (apps/api/src/ap/ap.service.ts approve path)
  AFTER the APPROVED transition commits, dispatching only for ASATEEL suppliers, once.
- An async poller (scheduled task / queue worker consistent with existing patterns in
  apps/api/src/queue) that polls GET /asateel/run/{run_id} every 30–60s, updates invoice
  reconciliation state, and on done ingests the Oracle file from disk as an
  ORACLE_UPLOAD Document. Handle failed/404/email_sent=false per decision 10.
- AP-only endpoints: get reconciliation status for an invoice; download the Oracle doc
  (reuse existing document download + role guard); re-run action.
- Env: read ASATEEL_TRIGGER_KEY, ASATEEL_API_BASE, ASATEEL_BATCHES_ROOT. Add to env
  example with comments.

### C. Frontend (Next.js) — AP side only
- On the AP invoice-detail view, show reconciliation status
  (queued/running/done/failed/status-lost, email-failed badge) and a download button that
  appears only when done. Poll status every 30–60s. Re-run button on failure. Follow
  Accord brand guidelines (Inter, navy #1E40AF, action blue #2563EB, Lucide icons, status
  pills). Bilingual EN/AR consistent with existing i18n. Nothing on the supplier view.

## CONSTRAINTS
- Match existing code conventions, module structure, Zod schemas in packages/shared-types,
  auth decorators/guards, and the audit trail pattern (record integration events).
- Do NOT call the trigger API from the browser. Key stays server-side.
- Do NOT auto-deploy. Do NOT run prisma migrate against any production DB. Generate the
  migration files; report what would run.
- Report the full diff, files touched, migration SQL, and any assumptions. Note anything
  you could not verify (e.g. exact storage service method names) with the fallback you chose.

Implement it. Report the diff and files touched; do not deploy.
