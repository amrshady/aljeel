# Handoff — Finish the Jawal Portal-Trigger Integration (remaining engine + deploy work)

_Author: portal-side integration pass (2026-07-06). This brief is for the engine/ops
AI bot that can reach the **Jawal reconciliation engine repo** and the **droplet**._

The AlJeel AP **portal** side of the Jawal integration is fully built, typechecked,
tested, and documented (see `CODEX_jawal-vendor-integration_2026-07-06.md`). Two pieces
remain that could **not** be done from the portal repo because they live elsewhere:

- **Task A — Golden gate** (plan step 1): belongs in the **Jawal engine repo**
  (the tree with `scripts/`, `pipelines/jawal.py`, `run_v30.py`, `qc/asateel_golden_check.py`).
  Live checkout on the droplet: `/home/clawdbot/.openclaw/workspace/aljeel/`.
- **Task B — Deploy & E2E verify** (plan step 5): needs the droplet + the portal DB.

Do **Task A first** (lock the gate before anything runs for real), then **Task B**.

---

## Ground truth (already shipped — do not rebuild)

**Portal repo (NestJS + Next):**
- `apps/api/src/ap/jawal-integration.service.ts` — stages docs, `POST /jawal/run`,
  polls `/jawal/run/{id}`, ingests the resolved xlsx as an AP-only `ORACLE_UPLOAD` doc.
- `apps/api/prisma/migrations/20260706000000_jawal_integration/` — `jawal*` columns.
- `apps/api/prisma/seed-jawal.ts` — supplier seeded `erpIntegration: 'JAWAL'`.
- `apps/web/src/components/reconciliation-panel.tsx` — vendor-agnostic panel.

**Engine repo (Flask trigger, already added by the portal pass):**
- `workers/evidence-browser/backend/droplet_api_flask.py` now exposes:
  - `POST /jawal/run` → `202 {run_id, status:"queued", queue_position}` (auth
    `X-Jawal-Trigger-Key`, body `{archive_date, folder_name, batch_id}`)
  - `GET /jawal/run/<run_id>` → `{status, started_at, finished_at, error}` / `404`
  - single-worker FIFO queue reusing `run.lock`; strips the portal `<docId>-` filename
    prefix; runs the existing Stage 1–5 pipeline; output at
    `batches/jawal-<batch>/output/Spreadsheet-<batch>-FILLED-v30.xlsx`.

> NOTE: the Flask file is edited in the portal repo copy at
> `workers/evidence-browser/backend/droplet_api_flask.py`; the **live** copy on the
> droplet is `~/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py`. Task B
> includes deploying it.

---

## Task A — Jawal golden gate (mirror the Asateel gate)

**Model it exactly on the existing Asateel gate:**
- `qc/asateel_golden_check.py` (runs `pipelines/asateel.py`, snapshots stable output
  fields, exits non-zero on drift with `GOLDEN DRIFT` diff, `GOLDEN OK` on pass)
- `qc/asateel_golden_expected.json` (the locked snapshot)

**Deliverables (in the engine repo):**
1. **Pick a locked regression batch** — use a Jawal batch with known-good output
   already on disk (e.g. `J26-788`, benchmarked in `qc/reports/jawal-*.md`). Confirm
   its evidence + invoice are present under `batches/jawal-J26-788/`.
2. **`qc/jawal_golden_check.py`** — mirror `asateel_golden_check.py`:
   - Run the deterministic pipeline for the locked batch. Prefer the **Stage 1
     cascade** output (suffix `v15.11.2`) or whatever is reproducible **without** the
     Gemini LLM stages, since Stage 2/3 (`run_v30.py`, `ai_fraud_detector.py`) are
     non-deterministic. Do **not** gate on LLM-variable fields.
   - Build an `_actual_snapshot()` from the resolved output for that batch
     (`batches/jawal-J26-788/output/Spreadsheet-J26-788-FILLED-v30.xlsx` and/or the
     review JSON `dashboard/public/data/j788-rows-v30.json`): capture **stable**
     aggregates only — row count, per-status counts, count of resolved-vs-exception
     rows, blank-key rows, and the "all-5" field-match tallies the team already tracks.
   - Diff against `qc/jawal_golden_expected.json`; print a keyed diff; return non-zero
     on any drift.
3. **`qc/jawal_golden_expected.json`** — generate it from a known-good run of the
   locked batch and commit it as the baseline.
4. **Wire it into CI / the pre-change checklist** the same way `asateel_golden_check.py`
   is invoked, so any future engine change must keep the Jawal gate green.

**Acceptance:** `python3 qc/jawal_golden_check.py` prints `GOLDEN OK` on a clean run,
and prints `GOLDEN DRIFT` + a keyed diff (non-zero exit) if the locked batch's stable
output changes.

---

## Task B — Deploy & E2E verify (plan step 5)

Follow `CODEX_jawal-vendor-integration_2026-07-06.md` §3–§4 exactly. Summary:

1. **Portal DB:** `cd apps/api && pnpm prisma migrate deploy && pnpm prisma generate`.
2. **Seed the supplier:** `npx tsx prisma/seed-jawal.ts` (idempotent; sets
   `erpIntegration='JAWAL'`).
3. **Portal API env** (server-side): `JAWAL_TRIGGER_KEY`, `JAWAL_API_BASE=http://127.0.0.1:5000`,
   `JAWAL_BATCHES_ROOT=/home/clawdbot/.openclaw/workspace/aljeel/batches`; restart the API.
4. **Droplet:** add `JAWAL_TRIGGER_KEY=<same secret>` to `/home/clawdbot/.openclaw/.env`,
   deploy `droplet_api_flask.py` to `~/.openclaw/workspace/aljeel/scripts/`,
   `sudo systemctl restart aljeel-flask.service`. Smoke test:
   ```bash
   curl -s -X POST http://127.0.0.1:5000/jawal/run \
     -H "X-Jawal-Trigger-Key: $JAWAL_TRIGGER_KEY" -H "Content-Type: application/json" \
     -d '{"batch_id":"NOPE","folder_name":"/tmp/does-not-exist"}'
   # expect 400 "staging failed"  (NOT 401)  → key + route wired
   ```
5. **E2E:** approve a Jawal invoice in the portal → panel shows Queued→Running→Done →
   confirm `batches/jawal-<batch>/output/Spreadsheet-<batch>-FILLED-v30.xlsx` is
   non-empty and the AP-only **Download resolved file** works. Check Failed + Re-run +
   STATUS_LOST paths. **Only enable for real once the golden gate (Task A) is green.**

---

## Constraints (do these the boring, safe way)

- **Golden gate before enabling.** Do not flip Jawal on for real volume until
  `qc/jawal_golden_check.py` is green and committed.
- **Do not gate on LLM output.** Gemini stages are non-deterministic; snapshot only
  deterministic aggregates.
- **Do not change the portal↔engine contract.** `POST /jawal/run` must keep returning
  `202 {run_id,status,queue_position}` and `GET /jawal/run/<id>` the status shape; the
  portal depends on it and on the output path
  `batches/jawal-<batch>/output/Spreadsheet-<batch>-FILLED-v30.xlsx`.
- **Secrets stay server-side.** `JAWAL_TRIGGER_KEY` only in `/home/clawdbot/.openclaw/.env`
  (droplet) and the portal API env — never in the browser, never committed.
- **No prod DB migrate without review.** Generate/apply migrations deliberately; report
  what ran.
- **Report** the diff, files touched, the locked batch id, the generated expected
  snapshot, and anything you couldn't verify.

---

## Optional follow-up (portal, only if the engine needs the real folder tree)

Portal uploads are stored flat (folder hierarchy dropped at upload; `documents.service`
sanitizes filenames). Staging drops evidence flat into `batches/jawal-<batch>/raw/`,
which the engine's "live batch layout" already accepts. If Jawal genuinely needs the
nested per-ticket tree, capture `webkitRelativePath` at the **upload layer** in the
portal (`apps/api/src/documents` + the web uploader) and preserve subpaths through
staging. Skip unless a real batch proves the flat set is insufficient.
