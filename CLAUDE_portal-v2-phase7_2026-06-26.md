Phase 7 complete and deployed. Summary below.

## Phase 7 — Risk & Inconsistencies report view: done

### Files added / changed (v2 frontend only)
- **Added** `dashboard/public/v2/components/report-table.js` — `ReportTable(payload)` component.
- **Added** `dashboard/public/v2/views/report.js` — `ReportView(runId) → {node, load()}` Exceptions-tab view.
- **Changed** `dashboard/public/v2/views/run-detail.js` — imported `ReportView`, replaced the Exceptions placeholder with `report.node`, lazy-load `report.load()` on first open of the tab (mirrors the evidence tab). Logs tab placeholder left intact.
- **Changed** `dashboard/public/v2/tokens.css` — appended a "Phase 7" section (KPI grid, category bars, severity strip, sticky-header exceptions table; `.gap-5/.gap-6`). Brand tokens only, no new colors/fonts.

Untouched: index.html, portal.html, all v1 assets, both droplet_api_*.py.

### Behavior
- **ReportTable**: ① four headline **KPI cards** — Flagged rows, **SAR at risk** (via shared `fmtMoney`), Hard exceptions, **Risk catches** (the `fraud_catches` value, labeled per the backend's own "Fraud-watch→Risk" normalization, never "Fraud Watch"); ② **category breakdown** as proportional labeled bars (`--action` fill, scaled to max) plus a compact `severity_counts` badge strip; ③ **severity-sorted exceptions table** (server already orders HARD→HIGH→MEDIUM→INFO) with columns Sl. # / Severity / Category / Employee No / Amount (SAR) / Detail. Severity badges colored by `severity_bucket` using brand status tokens: **HARD→`err`, HIGH→`alert`, MEDIUM→`warn`, INFO→`info`** (fallback `muted`).
- **ReportView**: lazy GET `?format=json` with a loading **skeleton**; renders ReportTable + a toolbar (**[Regenerate]**, **Download .xlsx**, **Download .md**). Clean **"No report yet — Generate"** empty state for `report_not_found/report_payload_unavailable/run_dir_not_found`; transient errors show a Retry. **Regenerate/Generate** POSTs `/report` (synchronous — awaits the 200 `ready`, then re-fetches json; no poller touched, so no collision with run-detail's run-state poll). Downloads are native `<a download>` to `?format=xlsx`/`?format=md` (carry the Access cookie + Content-Disposition).

### Escaping
All dynamic strings land via `el()`'s `text:`/`textContent` — no `innerHTML` for data. `icon()` injects only static trusted SVG path data.

### Real endpoint shape matched (vs spec — skew noted)
Confirmed against live `localhost:5000` for `J26-788-20260626T043340Z-075b83`:
- Headline KPIs are under **`kpis`**, not spec C.6's `headline` (same sub-keys). Payload also carries `categories`, `severity_counts`, `label`, `generated_at`, `summary`, `rows`.
- **Row keys differ from spec** `{sl_nos,severity,category,employee_no,amount,detail}`. Real keys include `*Amount`, `Employee No`, `all_sl_nos`/`Sl. #`, `severity_bucket`, `value_at_risk_sar`, etc. Mapping handled in the component (documented inline).
- **POST is synchronous** (`200 {state:'ready'}`), not async — so no polling.
- Live data: `kpis {flagged_rows:45, sar_at_risk:73552.14, hard_count:15, fraud_catches:2}`, 5 categories, 47 rows; `?format=xlsx` → 200 17428 B and `?format=md` → 200 506 B (both pre-generated at FINALIZING per G3). Recorded the skew in memory.

### Deploy + verification
- Deployed `dashboard/public` → **aljeel-ap-finance** Pages, branch main: **deployment `6a2d6579`** (4 changed files). No Flask restart.
- Ungated `https://aljeel-ap-finance.pages.dev`: `/v2/components/report-table.js` and `/v2/views/report.js` → **200 `application/javascript`**, `/v2/tokens.css` → **200 `text/css`**.
- Gated `https://finance.aljeel.accordpartners.ai/v2/views/report.js` (unauth) → **302** to Cloudflare Access login (gate intact).
- Data path proven real against the backend (kpis/categories/rows + xlsx/md downloads above). Root not cut over — v1 stays default; v2 at `/portal-v2`.
