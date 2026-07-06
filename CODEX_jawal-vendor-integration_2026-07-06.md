# Jawal Travel Portal-Trigger Integration — Deploy & Verify Runbook

_Mirrors the Asateel approve→reconcile integration. Shipped 2026-07-06._

Lets AP staff trigger the existing Jawal Travel reconciliation engine directly from
the portal invoice page — one-click, with status badge, Re-run, and resolved-file
download — exactly like Asateel.

---

## 1. What shipped (portal repo)

### Data layer
- `apps/api/prisma/schema.prisma` — `Invoice` gains `jawal*` tracking columns
  (`jawalRunId`, `jawalStatus`, `jawalQueuePosition`, `jawalError`, `jawalFolderName`,
  `jawalTriggeredAt/StartedAt/FinishedAt/LastPolledAt`, `jawalOutputDocumentId`).
  Reuses the existing `AsateelRunStatus` enum as the shared run-status type.
- `apps/api/prisma/migrations/20260706000000_jawal_integration/migration.sql` — the
  additive migration (columns + unique `jawalRunId` index + `jawalStatus` index).
- `apps/api/prisma/seed-jawal.ts` — the Jawwal supplier is now seeded with
  `erpIntegration: 'JAWAL'` (previously unset, so the enum value was dead).

### Backend (NestJS)
- `apps/api/src/ap/jawal-integration.service.ts` — new; mirror of the Asateel service.
  Stages docs → `POST /jawal/run` → async poller on `/jawal/run/{id}` → ingests the
  resolved `Spreadsheet-<batch>-FILLED-v30.xlsx` as an AP-only `ORACLE_UPLOAD` doc.
  No region/email (Jawal has neither).
- `apps/api/src/ap/ap.service.ts` / `ap.module.ts` / `ap.controller.ts` — reconciliation
  status/re-run route by `supplier.erpIntegration`; approve dispatches to both vendor
  engines (each self-guards on its own `erpIntegration`).

### Frontend + shared
- `apps/web/src/components/reconciliation-panel.tsx` — vendor-agnostic
  `ReconciliationPanel` (replaces `AsateelReconciliationPanel`). Uses `status.vendor`
  to pick title/download labels.
- `packages/shared-types/src/ap.ts` + `index.ts` — reconciliation status carries a
  `vendor` field and generic `outputDocumentId` / `outputFileName`; added
  `SupplierErpIntegrationSchema` and `ReconRunStatusSchema`.
- `apps/web/messages/{en,ar}.json` — vendor-aware `reconciliation` namespace.
- `apps/api/.env.example` — `JAWAL_TRIGGER_KEY`, `JAWAL_API_BASE`, `JAWAL_BATCHES_ROOT`.

### Engine (Flask, `workers/evidence-browser/backend/droplet_api_flask.py`)
- New `POST /jawal/run` + `GET /jawal/run/<run_id>` (see contract below), a single-worker
  FIFO queue reusing the shared `run.lock`, portal-doc staging that strips the `<docId>-`
  prefix, and status derived from the pipeline log markers.

---

## 2. Portal ⇄ engine contract

```
POST /jawal/run
  headers: X-Jawal-Trigger-Key: <shared secret>
  body:    { "archive_date": "YYYY-MM-DD", "folder_name": "<staged src dir>", "batch_id": "J26-788" }
  → 202    { "run_id": "ab12cd34", "status": "queued", "queue_position": 0 }

GET /jawal/run/<run_id>
  headers: X-Jawal-Trigger-Key: <shared secret>
  → 200    { "run_id", "status": queued|running|done|failed, "started_at", "finished_at", "error" }
  → 404    unknown run_id  (portal → STATUS_LOST, offers Re-run)
```

Output read back by the portal off shared disk:
`batches/jawal-<batch_id>/output/Spreadsheet-<batch_id>-FILLED-v30.xlsx`.

---

## 3. Deploy checklist (step 5)

> Do NOT auto-deploy. Run these deliberately.

1. **DB migration** (portal API host / DB):
   ```bash
   cd apps/api
   pnpm prisma migrate deploy      # applies 20260706000000_jawal_integration
   pnpm prisma generate
   ```

2. **Seed / mark the Jawal supplier** (idempotent):
   ```bash
   cd apps/api && npx tsx prisma/seed-jawal.ts
   ```
   Confirms `supplier_jawal.erpIntegration = 'JAWAL'`.

3. **Portal API env** (server-side only; never in the browser):
   ```
   JAWAL_TRIGGER_KEY=<same secret as the droplet>
   JAWAL_API_BASE=http://127.0.0.1:5000
   JAWAL_BATCHES_ROOT=/home/clawdbot/.openclaw/workspace/aljeel/batches
   ```
   Restart the NestJS API.

4. **Droplet env + Flask redeploy**:
   - Add `JAWAL_TRIGGER_KEY=<same secret>` to `/home/clawdbot/.openclaw/.env`.
   - Deploy the updated `droplet_api_flask.py` to `~/.openclaw/workspace/aljeel/scripts/`.
   - `sudo systemctl restart aljeel-flask.service`
   - Smoke test the key + route:
     ```bash
     curl -s -X POST http://127.0.0.1:5000/jawal/run \
       -H "X-Jawal-Trigger-Key: $JAWAL_TRIGGER_KEY" \
       -H "Content-Type: application/json" \
       -d '{"batch_id":"NOPE","folder_name":"/tmp/does-not-exist"}'
     # expect 400 "staging failed" (NOT 401) → key + route are wired
     ```

---

## 4. End-to-end verification

1. In the portal, open a Jawal-supplier invoice (e.g. `J26-788`) with its evidence
   uploaded, and **Approve** it (AP_CLERK/AP_APPROVER).
2. The `ReconciliationPanel` shows **Jawal Travel reconciliation → Queued/Running**.
3. Watch the run: `GET /jawal/run/<run_id>` flips `queued → running → done`
   (or tail `tmp/pipeline-logs/*-<run_id>.log` on the droplet).
4. On **done**: confirm the resolved file exists and is non-empty —
   `batches/jawal-J26-788/output/Spreadsheet-J26-788-FILLED-v30.xlsx` — and the panel's
   **Download resolved file** button serves it (AP-only; hidden from the supplier view).
5. Failure paths: kill the run / bad batch → panel shows red **Failed** with the error,
   invoice stays APPROVED, **Re-run** re-queues. Restart Flask mid-run → **STATUS_LOST**.

---

## 5. Known boundaries / follow-ups

- **Golden gate (plan step 1)** — `jawal_golden_check.py` + regression fixture live in
  the **Jawal engine repo** (`origin/master`: `scripts/`, `pipelines/jawal.py`,
  `run_v30.py`), not this portal worktree. Add it there before enabling for real
  volume, same discipline as Asateel.
- **Flat staging** — portal uploads are stored with flat, sanitized filenames (folder
  hierarchy is not captured at upload). Staging drops evidence flat into
  `batches/jawal-<batch>/raw/`, which the engine's "live batch layout" already accepts
  (flat `.msg`/PDF set). If Jawal ever needs the true nested tree, capture
  `webkitRelativePath` at the upload layer — a separate change.
- **In-memory run registry** — the Flask trigger keeps run status in-memory (single
  process, `app.run(threaded=True)`). A Flask restart mid-run surfaces as `404` →
  STATUS_LOST, which the portal handles gracefully via Re-run.
- **`batch_id` format** — the engine expects `J26-<n>`; invoice numbers that don't match
  will fail in-pipeline (surfaced as Failed), never silently.
