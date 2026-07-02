## Phase 5 — Batches → Runs history → Run detail ✅

Built the three core list/detail views to a finished state, reusing all Phase 4 infra (router, `apiFetch`, `stateChip`/`icon`/`toast`/formatters, shared `poll.js`, brand tokens). Deployed and verified through Cloudflare.

### Files added
| File | Role |
|---|---|
| `v2/components/stage-bar.js` | **StageBar** — eased progress from `stage_index/stage_total`, friendly stage labels (worker's `STAGES`), green-on-SUCCEEDED / red-on-FAILED fill. `{node, update(state)}` so the poller drives one DOM node. |
| `v2/components/timeline.js` | **RunTimeline** — Created→Started→Ended ticks, relative time + absolute on hover, terminal-colored Ended dot. |
| `v2/components/download-button.js` | **DownloadButton** — SPLIT-only `<a download>` to `/runs/<id>/download`; shows artifact name + size + sha prefix + "as of <ts>"; disabled until `artifacts.split` present. |
| `v2/run-trigger.js` | Shared `startRun()` — POST `/batches/<id>/runs`; **202 → navigate to new run detail**, **409 → toast "a run is already in progress" + "View active run" link**. |

### Files changed
- `v2/views/runs.js` — replaced stub: newest-first row list (state chip + trigger badge, short id, started rel/abs, rows/flagged/SAR/duration), header **[Re-run]** CTA, row→detail, Back-to-batches.
- `v2/views/run-detail.js` — replaced stub: the poll-driven heart (below).
- `v2/views/batches.js` — wired the **Run** CTA to `startRun` with busy/spinner state (was a placeholder toast).
- `v2/app.js` — extended `toast` for an optional action link; added `TERMINAL_STATES`/`isTerminal`, `fmtDuration`, and `arrow-left`/`file-text`/`terminal` icons. (StateChip already mapped every state incl. STALLED — left in place.)
- `v2/tokens.css` — added a layout-only Phase 5 block (stagebar, timeline, tabs, run-row, stalled banner, disabled-`<a>`) using existing tokens only — no new colors/fonts.

### How completion-via-poll + STALLED work
On mount, run-detail does **one** `GET /api/v2/runs/<id>` and renders immediately. If `isTerminal(state)` it renders "done" with the SPLIT download wired straight from the store's `artifacts` manifest and **never starts a poll**. Otherwise it starts the shared visibility-aware poller (~2s) whose tick re-reads run-state, drives the chip/StageBar/RunTimeline, and returns `true` (stops) the instant state goes terminal. Every signal comes from the persistent store, so closing the tab and reopening hours later still renders the correct terminal screen — no stream. **STALLED**: when the payload reports `stalled:true`, a prominent alert banner appears above the tabs (the run stays RUNNING in the store until the reaper promotes it).

### SPLIT DownloadButton
Single download surface, `/runs/<id>/download` only — no `/full` anywhere. Disabled with an explanatory caption until `artifacts.split` exists; once present, enables with name, size, sha prefix, and "as of". Exceptions tab labeled **"Risk & Inconsistencies"** (placeholder, Phase 7); Evidence (Phase 6) and Logs (Phase 8) are clean placeholders so the tab strip resolves.

### Deploy
`npx wrangler pages deploy public` → **aljeel-ap-finance** (`finance.aljeel.accordpartners.ai`), branch main. Deployment **`bb2e7f17`** (9 changed files uploaded). Root not cut over — v1 stays default; v2 at `/portal-v2`.
- Gated: `https://finance.aljeel.accordpartners.ai/portal-v2`
- Ungated (testing): `https://aljeel-ap-finance.pages.dev/portal-v2`

### Through-Cloudflare verification
- **Gate intact** — unauthenticated `/portal-v2`, `/v2/views/run-detail.js`, `/v2/components/stage-bar.js`, `/api/v2/ping` all **302 → Cloudflare Access** login.
- **Assets** on ungated production: `/portal-v2` 200 `text/html`; `runs.js`, `run-detail.js`, all three `components/*.js`, `run-trigger.js` 200 `application/javascript`; `tokens.css` 200 `text/css`. Deployed `run-detail.js` and `tokens.css` confirmed to contain the new code (not cached stubs).
- **Backend now live** — `/api/v2/*` returns the blueprint's structured `access_header_required` 401, not Phase 4's Flask 404, confirming phases 0-3 are registered. The worker correctly strips client-supplied `Cf-Access-*` headers (only the edge-injected identity is trusted).
- **The key proof** — a real SUCCEEDED run exists (`J26-788-…-075b83`). Its `GET /v2/runs/<id>` returns `state:SUCCEEDED`, `stage_index 9/9`, full timeline, `duration_sec 416`, and `artifacts.split {bytes:56330, sha256:53f6b9a0…}`. My view renders this terminal **without starting any poll**, and `GET /v2/runs/<id>/download` returns **200, `Content-Disposition: attachment; filename=Spreadsheet-J26-788-FILLED-v30-SPLIT.xlsx`, correct xlsx MIME, exactly 56330 bytes (valid Excel)** — served from the run dir with no live stream. Batches `last_run` and the runs-history row for the same run also match my views' field access exactly.

Nothing in v1 was touched (no edits to `index.html`/`portal.html`/v1 assets/`droplet_api_flask.py`/`droplet_api_v2.py`); no SSE anywhere; SPLIT-only; report label is "Risk & Inconsistencies."
