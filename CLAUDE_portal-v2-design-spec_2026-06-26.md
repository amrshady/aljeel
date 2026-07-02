I have everything I need. No more files to read — I'll write the spec. (Read-only task; I will not edit any files.)

Here is the complete spec.

---

# PORTAL v2 — Design & Architecture Spec
**AlJeel AP / Jawal Reconciliation Portal — parallel rebuild**
Status: design only. Current portal (`/portal.html`) stays live and untouched. v2 ships at a separate route behind the same Cloudflare Access gate until sign-off.
Date: 2026-06-26

---

## 0. Context & root causes (what we learned from v1)

**Current topology**
- **Pages project** `aljeel-ap-finance` (`dashboard/public/`), Worker `_worker.js`, gated by **Cloudflare Access (OTP)** on `aljeel-ap-files.accordpartners.ai`.
- **Droplet Flask API** `droplet_api_flask.py` at `https://aljeel-ap.accordpartners.ai` via a permanent CF Tunnel (`c281300c…`). Worker proxies `/api/*` and `/evidence/*` to it.
- **Run state lives only in two places:** the lock files `run.lock` / `run.lock.ts`, and the append-only log `tmp/pipeline-logs/{ISO}-{run_id}.log`. There is **no run database**. Completion is a string marker (`[PIPELINE_SUCCESS]` / `[PIPELINE_FAILED: …]` / `[END]`) written into the log.

**Why v1 breaks (the thing v2 must kill).** The browser learns a run finished *only* by reading `[END]` over a live `EventSource`. On big runs the stream is long-lived; any disconnect (tunnel hiccup, sleep, refresh, big-output buffering) means the client can miss `[END]`. The reconnect path (`attemptReconnect` → `/api/current-run` → `/api/run-log` replay) tries to paper over this with line-count skipping and a 9s file-existence watchdog, but it is racy and regularly leaves the UI "running forever" while the output and downloads are already sitting on disk. **Completion is coupled to connectivity.**

**Other debt to drop:** downloads default to the **FULL** file (`/full`) — v2 must serve **SPLIT only**; vanity stats (`N / M Resolved`, "Actual LLM Requests", `Gemini-Pro-Latest` in the terminal); unbounded terminal DOM; no run history; no per-run report wiring; report still named "Fraud-Watch".

**The fix in one sentence:** make a **persistent run-state store** the single source of truth that the worker writes and the UI *polls/loads on open* — the live log becomes an optional, separate convenience view, never the completion signal.

---

## A. Information architecture / screen map

Single static SPA at `/v2/` (entry `portal-v2.html`). Four levels, hash-routed so deep links and refresh survive:

```
┌─ Batches  (#/)
│    grid of batches: id, evidence item-count, last-run status chip + time, "Run" CTA
│
├─ Runs history  (#/b/<batch>)
│    newest-first list of runs for one batch
│    each row: run_id short, started (relative+absolute), state chip,
│              rows count, flagged count, SAR-at-risk, duration
│    actions: [Re-run]  → header CTA
│
├─ Run detail  (#/b/<batch>/r/<run_id>)
│    header: state machine chip (live-updating via poll), timeline, duration
│    tabs (collapsing columns / animated):
│      • Output     → SPLIT download (the only download), file name/size/sha, "as of <ts>"
│      • Exceptions → Risk & Inconsistencies report: [Generate] (per-run, on click) → render + download (.xlsx/.md)
│      • Evidence   → folder tree for THIS run's evidence root → open .msg/.eml/.pdf inline, file timestamps
│      • Logs       → (separate view) tailed run log, byte-offset paged, timestamped — opt-in, not the main flow
│
└─ Evidence viewer  (modal/pane within Run detail)
     .msg/.eml rendered as structured email (subject/from/to/date/body/attachments)
     attachments open via msg-attachment; pdf inline; xlsx download
```

Nav: Navy bar, white wordmark, Action-Blue active item; breadcrumb `Batches / J26-925 / Run a1b2c3`. Lucide outline icons throughout. No global "run console" — running is always *inside a batch*.

---

## B. Run lifecycle state machine + persistent run-state store

### B.1 State machine

```
              POST /v2/batches/<b>/runs
                        │
                        ▼
   ┌──────────┐   worker picks up    ┌────────────┐
   │  QUEUED  │ ───────────────────▶ │ PREFLIGHT  │
   └──────────┘                      └─────┬──────┘
        │ (lock busy → rejected at API,         │ preflight done
        │  never enters store)                  ▼
                                         ┌────────────┐
                                         │  RUNNING   │  (stages 1–5, heartbeat each stage)
                                         └─────┬──────┘
                                               │ pipeline exit code captured
                                               ▼
                                         ┌────────────┐
                                         │ FINALIZING │  (snapshot SPLIT + manifest into run dir)
                                         └─────┬──────┘
                          ┌────────────────────┼─────────────────────┐
                          ▼                    ▼                      ▼
                    ┌──────────┐         ┌──────────┐          ┌───────────┐
                    │ SUCCEEDED│         │  FAILED  │          │ CANCELLED │ (operator)
                    └──────────┘         └──────────┘          └───────────┘

   Liveness overlay (computed, not stored as a transition):
     state ∈ {PREFLIGHT,RUNNING,FINALIZING} AND now-heartbeat_at > 120s AND pid not alive
       → surfaced to UI as "STALLED" (the row is still RUNNING in the store; a reaper
         may promote it to FAILED[reason=abandoned] after a grace window).
```

**Terminal states** (`SUCCEEDED`, `FAILED`, `CANCELLED`) are immutable and carry an `artifacts` manifest. The UI determines "done + downloadable" purely from `state ∈ terminal` + `artifacts.split` present — **no stream required**. Re-running creates a *new* run row; it never mutates a prior run.

### B.2 Store — SQLite on the droplet (source of truth) + immutable per-run dir (artifacts)

Chosen: **SQLite** (`<ROOT>/state/runs.db`) for the queryable index/state, plus an **immutable artifact directory** per run so downloads and reports are stable across re-runs. (SQLite over loose JSON: cheap newest-first history queries, atomic state writes, single-writer worker. It stays droplet-side — unrelated to the 25 MB Pages limit that forces `audit_runs.db` deletion before deploy.)

```sql
CREATE TABLE runs (
  run_id        TEXT PRIMARY KEY,         -- 'J26-925-20260625T151520Z-a1b2c3' (sortable, human)
  batch_id      TEXT NOT NULL,            -- 'J26-925'
  state         TEXT NOT NULL,            -- QUEUED|PREFLIGHT|RUNNING|FINALIZING|SUCCEEDED|FAILED|CANCELLED
  trigger       TEXT NOT NULL,            -- 'manual' | 'rerun'
  pid           INTEGER,                  -- worker pid (liveness check)
  created_at    TEXT NOT NULL,            -- ISO8601 UTC
  started_at    TEXT,                     -- entered PREFLIGHT
  ended_at      TEXT,                     -- entered terminal
  heartbeat_at  TEXT,                     -- worker bumps every stage / ≤30s
  stage         TEXT,                     -- 'cascade'|'v30-llm'|'fraud'|'split'|… (display only)
  stage_index   INTEGER,                  -- 0..N for progress bar
  stage_total   INTEGER,
  exit_code     INTEGER,
  failure_reason TEXT,
  evidence_root TEXT,                     -- absolute path used for THIS run
  log_path      TEXT,                     -- tmp/pipeline-logs/<id>.log
  run_dir       TEXT,                     -- state/runs/<batch>/<run_id>/
  -- denormalized summary (filled at FINALIZING from summary-v30.json + report)
  total_rows    INTEGER,
  flagged_rows  INTEGER,
  sar_at_risk   REAL,
  hard_count    INTEGER,
  artifacts_json TEXT                     -- JSON manifest (see below)
);
CREATE INDEX idx_runs_batch_created ON runs(batch_id, created_at DESC);
```

`artifacts_json` manifest (snapshotted at FINALIZING into `run_dir`, so re-runs don't overwrite):
```json
{
  "split":  {"name":"Spreadsheet-J26-925-FILLED-v30-SPLIT.xlsx","rel":"Spreadsheet-J26-925-FILLED-v30-SPLIT.xlsx","bytes":41080,"sha256":"…"},
  "report": {"xlsx":"Inconsistencies-Report-J26-925.xlsx","md":"Inconsistencies-Report-J26-925.md","generated_at":"…"|null},
  "summary":{"rel":"summary-v30.json"},
  "evidence_snapshot":{"rel":"evidence-tree.json","captured_at":"…"}
}
```

Per-run directory layout (immutable after FINALIZING):
```
state/runs/J26-925/J26-925-20260625T151520Z-a1b2c3/
  Spreadsheet-J26-925-FILLED-v30-SPLIT.xlsx     ← snapshot (the ONLY served download)
  summary-v30.json                              ← snapshot
  evidence-tree.json                            ← snapshot of folder/file listing + mtimes at run time
  Inconsistencies-Report-*.xlsx / .md           ← created lazily on Generate
  run.log                                       ← hardlink/copy of tmp log
  manifest.json                                 ← == artifacts_json
```

> Note: `.msg`/`.pdf` evidence files are **not** copied into the run dir (large, generally immutable per batch). The run dir snapshots the *tree listing*; bytes are read live from `evidence_root`. Fidelity caveat in §G.

**Single-writer rule:** only the worker process writes `runs` rows for a given `run_id`; the API reads. State transitions use `UPDATE … WHERE run_id=? AND state=?` (compare-and-set) so a reaper and worker never clobber each other.

---

## C. v2 backend API contract (NEW — current `/api/*` untouched)

All new routes live under **`/v2/*`** on the droplet, proxied by the Worker as **`/api/v2/*` → `/v2/*`**. JSON unless noted. Auth: same Cloudflare Access header (`Cf-Access-Authenticated-User-Email`) the Worker already forwards. Implemented in a **new module** (`scripts/droplet_api_v2.py`, registered as a Flask blueprint) so the v1 file is not edited.

### C.1 Batches
```
GET /v2/batches
→ 200 {"batches":[
    {"batch_id":"J26-925","evidence_root":"…","item_count":54,
     "last_run":{"run_id":"…","state":"SUCCEEDED","ended_at":"…","flagged_rows":27,"sar_at_risk":100049.59}|null}
  ]}
```
Reuses v1 discovery helpers (volume → `batches/jawal-J26-*` → `uploads/portal`); `last_run` from `runs` index.

### C.2 Run history
```
GET /v2/batches/<batch_id>/runs?limit=50
→ 200 {"batch_id":"J26-925","runs":[
    {"run_id":"…","state":"SUCCEEDED","trigger":"manual",
     "created_at":"…","started_at":"…","ended_at":"…","duration_sec":105.9,
     "total_rows":67,"flagged_rows":27,"sar_at_risk":100049.59,"hard_count":13,
     "has_report":true,"has_split":true}
  ]}                                               // newest-first
```

### C.3 Trigger run / re-run
```
POST /v2/batches/<batch_id>/runs
body {"no_cache":false,"invoice_path":"…"|null,"trigger":"manual"|"rerun"}
→ 202 {"run_id":"…","state":"QUEUED"}              // returns immediately, no stream
→ 409 {"error":"run_in_progress","active_run_id":"…"}   // lock held
```
Acquires the existing exclusive lock (`O_CREAT|O_EXCL`), inserts a `QUEUED` row, spawns the worker thread, returns. **Re-run** = same call with `trigger:"rerun"`; uses **latest pipeline code + latest evidence** for the batch by default (documented behavior, §G open-Q on pinning).

### C.4 Run state (the poll target — replaces SSE for completion)
```
GET /v2/runs/<run_id>
→ 200 {
  "run_id":"…","batch_id":"J26-925","state":"RUNNING","trigger":"manual",
  "stage":"v30-llm","stage_index":2,"stage_total":5,
  "created_at":"…","started_at":"…","ended_at":null,
  "heartbeat_at":"…","stalled":false,           // stalled computed server-side from heartbeat+pid
  "duration_sec":47.2,
  "summary":{"total_rows":67,"flagged_rows":null,"sar_at_risk":null},
  "artifacts":{"split":{…}|null,"report":{…}|null},
  "failure_reason":null
}
```
UI polls this every ~2 s while `state ∉ terminal`; **on page open it loads this once** and immediately shows the correct screen (running, or done-with-downloads). This is the heart of requirement #1.

### C.5 Evidence tree + .msg read (per run)
```
GET /v2/runs/<run_id>/evidence/tree
→ 200 {"run_id":"…","evidence_root":"…","folders":[
    {"folder":"01-07jun/03jun/6906126900","files":[
       {"name":"RE_ Approved_…Alfaleh.msg","ext":"msg","bytes":48213,"mtime":"…","rel":"…"}]}]}
                                                   // served from evidence-tree.json snapshot

GET /v2/runs/<run_id>/evidence/file?rel=<relpath>
→ for .msg/.eml: 200 {"type":"msg","subject":"…","from":"…","to":["…"],
                      "date":"…","body":"…","attachments":[{"index":0,"name":"ticket.pdf"}]}
→ otherwise: 200 binary stream (inline for pdf), guessed MIME
GET /v2/runs/<run_id>/evidence/msg-attachment?rel=<relpath>&attachment=<idx> → binary
```
Wraps the existing `msg_parser` / `extract_msg` / `fitz` helpers; `rel` is validated to stay under `evidence_root` (path-traversal guard).

### C.6 Report — Risk & Inconsistencies (generate on click, per run)
```
POST /v2/runs/<run_id>/report          → builds against THIS run's snapshot output
→ 202 {"state":"generating"}  then poll, or 200 {"ready":true,"generated_at":"…"} if synchronous & fast
GET  /v2/runs/<run_id>/report?format=json   → rendered report payload for the Exceptions tab:
   {"headline":{"flagged_rows":27,"sar_at_risk":100049.59,"hard_count":13,"fraud_catches":0},
    "categories":{"NO_APPROVAL":12,"NO_FOLDER":7,"DUP_ROUTE_STRICT":6,"SHARED_OPEX_SPONSORSHIP":5,"ROUND_AMOUNT":1},
    "rows":[{"sl_nos":"…","severity":"HARD","category":"NO_APPROVAL","employee_no":"…","amount":…,"detail":"…"}]}
GET  /v2/runs/<run_id>/report?format=xlsx   → file download (Inconsistencies-Report-<id>.xlsx)
GET  /v2/runs/<run_id>/report?format=md     → file download
```
Runs `build_inconsistencies_report.py <BATCH_ID>` with output redirected into the run dir (a thin `--out-dir` shim or `cwd` trick; the script already writes `Inconsistencies-Report-<ID>.{xlsx,md}`). **UI label: "Risk & Inconsistencies."** Never "Fraud Watch."

### C.7 Download — SPLIT only
```
GET /v2/runs/<run_id>/download
→ 200 binary, Content-Disposition: attachment; filename="Spreadsheet-<ID>-FILLED-v30-SPLIT.xlsx"
→ 404 {"error":"no_split_artifact"}   // if FINALIZING never produced one
```
Serves `run_dir/…-SPLIT.xlsx` only. **There is no `/full` endpoint in v2** — the non-split file is never reachable.

### C.8 Per-run logs (separate view)
```
GET /v2/runs/<run_id>/log?offset=<bytes>
→ 200 {"run_id":"…","offset":<start>,"next_offset":<end>,"eof":bool,
       "lines":[{"ts":"…","text":"…"}]}            // plain paged tail, NOT SSE
```
Byte-offset paging; the Logs tab polls with the returned `next_offset`. Reviewable per run forever (logs persist in `tmp/pipeline-logs` + run dir). This is the *only* place raw log text appears.

### C.9 Operator
```
POST /v2/runs/<run_id>/cancel   → 200 {"state":"CANCELLED"}   (kills worker pid, releases lock)
POST /v2/maintenance/reap       → 200 {"reaped":[…]}          (promote abandoned RUNNING→FAILED; also runs on a timer)
GET  /v2/ping                   → {"ok":true}
```

---

## D. Frontend architecture

**Stack:** vanilla ES modules, **no framework, no build step** — matches the existing static-Pages model and keeps deploys to a single `wrangler pages deploy`. State is small and server-authoritative; a framework adds risk without payoff here.

**Files (new, additive):**
```
dashboard/public/
  portal-v2.html              ← shell: <nav>, <main id="view">, design-token <style>
  v2/app.js                   ← hash router, view mounting, global fetch wrapper
  v2/api.js                   ← typed wrappers for every /api/v2/* call
  v2/poll.js                  ← single shared poller (visibility-aware: pauses on hidden tab)
  v2/views/batches.js
  v2/views/runs.js            ← run history list
  v2/views/run-detail.js      ← tabs host + state chip
  v2/views/evidence.js        ← tree + .msg reader pane
  v2/views/report.js          ← Risk & Inconsistencies
  v2/views/logs.js
  v2/components/{chip,timeline,tree,table,modal,toast,skeleton}.js
  v2/tokens.css               ← Accord brand tokens (below)
```

**Completion model (no SSE).** `poll.js` owns one interval. On a Run-detail mount it calls `GET /v2/runs/<id>`; if `state` is terminal it renders done immediately and stops. Otherwise it polls every 2 s, drives the stage progress bar + state chip from `stage_index/stage_total`, and stops on terminal. Closing the tab/app and reopening hours later still renders the correct terminal screen with the SPLIT download — because everything comes from the store, never a stream. The Logs tab is independent: its own offset-poller, lazy, opt-in.

**Motion (tasteful, on a stable backend):**
- **Collapsing columns:** Run-detail tabs are a CSS-grid where the active tab expands and siblings collapse — animate with **FLIP** (measure → `transform`) for 200 ms `cubic-bezier(.2,.7,.2,1)`; respects `prefers-reduced-motion`.
- State chip cross-fades on transition; stage progress bar eases width; evidence tree rows stagger-reveal (≤120 ms) on expand; skeleton shimmer while polling first load.
- Pure CSS transitions + tiny FLIP helper; no animation lib. 60fps target, transform/opacity only.

**Component breakdown**
| Component | Responsibility |
|---|---|
| `StateChip` | maps state→{label,color,icon}; `STALLED` overlay when `stalled:true` |
| `StageBar` | `stage_index/stage_total` → eased progress + stage label |
| `RunTimeline` | created→started→ended ticks with absolute + relative times |
| `EvidenceTree` | lazy folder expand, file-type icons, mtime column, click→reader |
| `MsgReader` | structured email render + attachment chips (pdf inline, xlsx download) |
| `ReportTable` | headline KPIs + category bars + severity-sorted rows |
| `LogTail` | offset-paged, monospace, auto-scroll toggle |
| `DownloadButton` | SPLIT only; shows name + size; disabled until artifact present |

**Removed clutter (requirement #7):** no LLM call counts, no model names, no "X/Y resolved", no cost in the main UI. (Token/cost detail, if ever wanted, lives only behind the Logs tab.)

---

## E. Parallel deploy plan (no disturbance to current portal)

**Principle: additive only. Same Pages project, same Worker file, same hostname, same Access app — so no new Cloudflare Access configuration and zero risk to `/portal.html`.**

1. **Static assets:** add `portal-v2.html` + `v2/**` to `dashboard/public/`. Current `index.html` / `portal.html` untouched. v2 lives at `https://aljeel-ap-files.accordpartners.ai/v2/` (served via `portal-v2.html`; `app.js` hash-routes under it). Cloudflare Access already covers the whole host → v2 is gated automatically.
2. **Worker routes:** add **one** new block to `_worker.js` *above* the static-asset fallback:
   ```js
   if (p.startsWith('/api/v2/')) {
     return proxyToDroplet(request, p.replace(/^\/api/, ''), url.search, false); // /api/v2/* → /v2/*
   }
   ```
   All existing `/api/*`, `/evidence/*`, KV, and `/files/*` branches are left exactly as-is and continue to serve v1.
3. **Backend:** register `droplet_api_v2.py` as a blueprint inside the running Flask app (import + `app.register_blueprint`) — a one-line addition at startup, no edits to v1 route bodies. v2 reuses the same lock so v1 and v2 can't run concurrent pipelines (correct: one droplet, one pipeline at a time).
4. **No auto-deploy coupling:** the v2 worker does **not** run `wrangler pages deploy` (v1's finalize step does, to refresh `public/outputs`). v2 serves downloads straight from the droplet run dir, so it needs no Pages redeploy to make a run downloadable. The v1 finalize behavior is unchanged.
5. **Cutover:** when signed off, flip the Pages root (or a redirect) from `index.html`/`portal.html` to `portal-v2.html`. Rollback = flip back; v1 assets never deleted during the trial.

---

## F. Ordered build plan (backend hardened first; Codex does one phase at a time)

**Phase 0 — Store foundation (backend).** Create `state/runs.db` + schema, `state/runs/<batch>/<run_id>/` layout, and a `run_store.py` with CAS state transitions, heartbeat, manifest write, newest-first queries. Unit-test transitions + reaper logic. No HTTP yet.

**Phase 1 — Worker + lifecycle (backend).** New `run_worker_v2()` that wraps the *existing* stage commands (`process_batch.py` → `run_v30.py` → fraud → inject → review → `split_multi_emp.py`), writing `stage`/`heartbeat_at` per stage and `SUCCEEDED/FAILED` + manifest at the end; snapshot SPLIT + summary + evidence-tree into the run dir. Reuse the existing lock. Verify a full run lands a terminal row with downloadable SPLIT — *with no client attached at all.*

**Phase 2 — v2 API blueprint (backend).** Implement `/v2/batches`, `/runs` (trigger/re-run, 409 on lock), `/runs/<id>` (state), `/runs/<id>/download` (SPLIT only), `/runs/<id>/log`, `/cancel`, `/maintenance/reap`, `/ping`. Register blueprint. Curl-test the full lifecycle and reconnect-after-close (open state mid-run, kill client, confirm terminal state still correct).

**Phase 3 — Evidence + report endpoints (backend).** `/runs/<id>/evidence/tree|file|msg-attachment` (snapshot tree, live bytes, traversal guard) and `/runs/<id>/report` (generate-on-click → run dir; json/xlsx/md). Confirm `.msg` renders and report regenerates per run.

**Phase 4 — Worker route + shell (frontend infra).** Add the `/api/v2/*` block to `_worker.js`; ship `portal-v2.html` shell, `tokens.css`, `app.js` router, `api.js`, `poll.js`. Prove end-to-end auth + proxy with a trivial Batches list.

**Phase 5 — Batches → Runs history → Run detail (frontend).** Build the three list/detail views with `StateChip`/`StageBar`/`RunTimeline`, polling, SPLIT `DownloadButton`. This satisfies #1–#5 visibly.

**Phase 6 — Evidence browser + .msg reader (frontend).** `EvidenceTree` + `MsgReader`, file timestamps, attachment handling.

**Phase 7 — Risk & Inconsistencies report view (frontend).** Generate-on-click, headline KPIs, category bars, severity table, xlsx/md download.

**Phase 8 — Logs view + motion polish (frontend).** Offset-paged `LogTail` in its own tab; add FLIP collapsing-columns, transitions, skeletons, `prefers-reduced-motion`; strip any residual clutter.

**Phase 9 — Hardening & cutover.** Reaper timer, cancel path, traversal/limit fuzzing, large-batch soak test (the v1 failure scenario), then sign-off flip.

Backend (0–3) is fully testable via curl before any UI exists — the explicit "harden backend first" requirement.

---

## G. Open questions for the client

1. **Re-run evidence pinning.** Default is *latest evidence + latest pipeline code*. Do you ever need to reproduce an old run **byte-for-byte** (pin code version + freeze evidence into the run dir)? That changes storage cost and whether we copy `.msg`/`.pdf` bytes per run.
2. **Run retention.** Keep all runs forever, or prune to last *N* per batch / older-than-*D* days (artifacts can be large)?
3. **Report on every run vs on click.** Spec says **generate on click** per run. Do you instead want it auto-generated at FINALIZING so history rows always show flagged/SAR numbers without a click? (Cheap to also auto-run and cache.)
4. **Report name.** Proposed **"Risk & Inconsistencies."** Acceptable, or prefer **"Exceptions Report"**? (Both avoid "Fraud Watch.")
5. **Concurrency.** One droplet = one pipeline at a time (shared lock). Is a queue (auto-start next when lock frees) wanted, or is "busy → try later" (409) fine?
6. **Cancel semantics.** On cancel mid-run, keep partial artifacts or discard the run dir entirely?
7. **Cutover hostname.** Trial at `/v2/` on the existing host (recommended — inherits Access). Or do you want a distinct subdomain (`v2.aljeel-ap…`) which needs its own Access app?
8. **Stalled threshold.** 120 s heartbeat gap + dead pid → `STALLED`, auto-FAIL after a grace window — what grace (e.g. 5 min) do you want before the reaper marks it FAILED?
9. **Who may trigger/re-run/cancel.** Any Access-authenticated reviewer, or restrict mutations to specific emails (we already receive `Cf-Access-Authenticated-User-Email`)?

---

## G-LOCKED. Client decisions (Amr Shady, 2026-06-26)

1. **Re-run pinning** — No byte-for-byte. Latest code + latest evidence. Snapshot SPLIT/summary/tree only; do not copy .msg/.pdf bytes per run.
2. **Retention** — Keep last 20 runs per batch; prune older artifacts but keep the DB row for history.
3. **Report timing** — Auto-generate at FINALIZING and cache (history rows always show flagged/SAR). Re-generate still allowed on click.
4. **Report name** — "Risk & Inconsistencies." Never "Fraud Watch."
5. **Concurrency** — No queue. Busy → 409 "try later." One droplet, one pipeline.
6. **Cancel** — Discard the run dir entirely, mark CANCELLED clean. No partial artifacts.
7. **Hostname** — Trial at `/v2/` on existing host; inherits Access, no new CF config.
8. **Stalled** — 120s heartbeat gap + dead pid → STALLED; reaper auto-FAILs after 5 min grace.
9. **Permissions** — Any Access-authenticated reviewer may trigger/re-run/cancel for now.

*End of spec. Build proceeds per §F, backend phases 0–3 first (Codex), UI phases 4–8 (Claude).*
