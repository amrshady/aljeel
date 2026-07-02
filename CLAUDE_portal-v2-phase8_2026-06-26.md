Phase 8 complete and deployed. Summary below.

## Phase 8 — Logs view + motion polish + clutter sweep: done

### Files added / changed (v2 frontend only)
**Added**
- `v2/components/log-tail.js` — `LogTail(runId, getState)` byte-offset paged tail.
- `v2/views/logs.js` — `LogsView(runId, getState) → {node, load, onShow, onHide}` (toolbar + LogTail).
- `v2/motion.js` — `prefersReducedMotion()`, `flip()` (FLIP), `crossFade()`. transform/opacity only, no lib.

**Changed**
- `v2/poll.js` — added **aux poll** mode so the live log tail runs *concurrently* with run-detail's run-state poll instead of replacing the singleton; `stopActivePoll()` now tears down aux polls too (no leak on nav).
- `v2/views/run-detail.js` — replaced the Logs placeholder with `LogsView`; FLIP collapsing-columns on tab switch; StateChip cross-fade on transition; tracks `latestRun` (so LogTail knows terminality); show/hide live tail on tab change.
- `v2/components/evidence-tree.js` — stagger-reveal on folder expand.
- `v2/components/stage-bar.js` — clutter sweep: stripped `LLM`/`AI` from stage labels.
- `v2/tokens.css` — Phase 8 section (LogTail viewport, tab pill/FLIP, live-dot pulse, stagger keyframe, auto-scroll toggle).

Untouched: `index.html`, `portal.html`, all v1 assets, `droplet_api_flask.py`, `droplet_api_v2.py`.

### LogTail behavior
- **Paging:** `load()` drains `GET …/log?offset=0` forward, paging from each `next_offset` until `eof` (handles the server's 256 KiB-per-response cap via a bounded loop).
- **Liveness:** running run → starts an **aux visibility-aware poll** (~2.5s) appending from `next_offset`; **stops only when terminal AND `eof:true`**. Terminal run → pages to eof once, no poll. `onHide()` pauses the tail (offset retained); `onShow()` resumes with no gap/refetch. **Never the completion signal** — completion stays the Phase 5 run-state poll.
- **Bounded DOM:** caps at 4000 retained line nodes (trims oldest to 3500 in chunks), killing the v1 unbounded-terminal bug; surfaces a "showing latest N lines" note when it trims.
- **Auto-scroll:** on by default; auto-pauses when the user scrolls up, re-arms at the bottom; "Bottom" button force-re-arms. Toolbar also has Copy (clipboard) + a pulsing **Live** indicator (only while tailing).
- **Escaping:** every line written via `textContent` — never `innerHTML`. Only place raw log text appears.

### Motion polish
- **FLIP collapsing-columns** on the run-detail tab strip: active tab expands (pill + padding), siblings collapse; measure→transform, 200ms `cubic-bezier(.2,.7,.2,1)`, translate-only (no text distortion). First mount applied instantly.
- **StateChip cross-fade** on real state/stalled changes only (no per-tick flicker).
- **Stage bar** eased width — already eased; kept/verified.
- **Evidence tree** row stagger-reveal on expand (delay capped at 120ms, opacity+translateY).
- **Skeleton shimmer** on LogTail first load (plus existing batches/runs/evidence/report).
- **prefers-reduced-motion:** `flip()`/`crossFade()` bail to instant via a live `matchMedia` check; CSS animations (stagger, live pulse, shimmer) are neutralised by the global `@media (prefers-reduced-motion: reduce)` rule that zeroes animation/transition durations. **Sanity note:** under reduced motion, tab switch = instant class swap, chip = instant swap, stagger/pulse = off — fully usable, no motion.

### Clutter sweep (audited all v2 views/components)
Grep across the whole v2 tree found **no** model names (no Gemini/GPT/Claude), **no** cost/token figures, **no** "X/Y resolved" vanity stats, **no** LLM call counts in the main UI. Only residual leakage: two stage labels — relabeled `LLM exception handler → Exception handler`, `AI consistency check → Consistency check`. Report KPIs (flagged rows, SAR at risk, hard exceptions, risk catches) are legitimate finance metrics. Cost/token detail can only ever appear behind the Logs tab.

### Real `/log` shape matched (vs spec C.8 — skew noted)
Confirmed live against `localhost:5000` for `J26-788-…-075b83`: keys are exactly `{run_id, offset, next_offset, eof, lines:[{ts,text}]}`. **Skew: `lines[].ts` is ALWAYS `null`** (backend `splitlines()`, no per-line timestamp parsing) — LogTail renders text-only, honors `ts` only defensively. Paging verified: `offset=0` → 507 lines `next_offset=34653 eof=true`; `offset=34653` (caught up) → 0 lines `eof=true`; `offset=99999` → clamps to size, `eof=true`. Recorded in memory ([portal-v2-log-shape](portal-v2-log-shape.md)).

### Deploy + verification
- Deployed `dashboard/public` → **aljeel-ap-finance** Pages, branch main: **deployment `74fd122a`** (8 files uploaded = exactly the 8 changed/new). No Flask restart.
- Ungated `aljeel-ap-finance.pages.dev`: `v2/motion.js`, `v2/components/log-tail.js`, `v2/views/logs.js` → **200 `application/javascript`**; `v2/tokens.css` → **200 `text/css`**.
- Gated `finance.aljeel.accordpartners.ai` (unauth): all three new modules → **302** to `akstat.cloudflareaccess.com` Access login (gate intact).
- Log-data path proven real against the backend (shape + paging-to-eof above). Root not cut over — v1 default; v2 at `/portal-v2`.

After this, only **Phase 9** (hardening: reaper timer, cancel path, traversal/limit fuzz, large-batch soak, cutover) remains.
