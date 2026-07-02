Phase 4 is built, deployed, and verified. Here's the report.

## Phase 4 — Portal v2 frontend infrastructure ✅

### New files (all additive, under `dashboard/public/`)
| File | Role |
|---|---|
| `portal-v2.html` | Shell: navy `<nav>` (white wordmark "Accord Partners" + product label), `<main id="view">`, breadcrumb, Inter via Google Fonts, links `tokens.css` + `app.js` (ES module) |
| `v2/tokens.css` | **Design-system foundation** — all Accord brand tokens + base classes |
| `v2/api.js` | Typed wrappers for **every** `/api/v2/*` endpoint (ping, batches, runs history, trigger/rerun, run state, download, evidence tree/file/msg-attachment, report json/xlsx/md/generate, log, cancel, reap) — shapes matched to `droplet_api_v2.py` |
| `v2/app.js` | Hash router (`#/`, `#/b/<batch>`, `#/b/<batch>/r/<run>`), view mounting, global `apiFetch` wrapper (error + Access-redirect handling), shared `stateChip`/`icon` (inline Lucide)/`toast`/formatters |
| `v2/poll.js` | Single shared visibility-aware poller (pauses on hidden tab, immediate catch-up tick on return) — the completion mechanism, no SSE |
| `v2/views/batches.js` | **Fully built** proof view: `GET /api/v2/batches` → card grid (id, evidence item-count, last-run chip + relative/abs time, flagged/SAR meta, Run CTA placeholder) |
| `v2/views/runs.js`, `v2/views/run-detail.js` | Stubs ("coming in Phase 5") so the router + breadcrumbs resolve |

### `_worker.js` — exactly the route block added (above the static fallback)
```js
// Portal v2 API — proxy /api/v2/* → droplet /v2/* (strip the /api prefix).
if (p.startsWith('/api/v2/')) {
  return proxyToDroplet(request, p.replace(/^\/api/, ''), url.search, false);
}
```
Plus **one additive line** in the `proxyToDroplet` GET branch (not a route branch) to forward the Access identity on GETs — required because v2's blueprint authenticates *every* request via `Cf-Access-Authenticated-User-Email`, which the helper previously forwarded only on POST. v1 ignores this header (verified — `droplet_api_flask.py` never reads it), so **all v1 `/api/*`, `/evidence/*`, KV, `/files/*` branches and `index.html`/`portal.html` are byte-for-byte unchanged** (confirmed: `/api/ping` still returns `{"status":"ok"}`).

### tokens.css brand fidelity
Encodes the mandatory Accord tokens faithfully: Inter (300–700); navy `#1E40AF`, action `#2563EB`, gold `#B8860B`, sage `#F0F4F3`, ink `#111827`, ink2 `#6B7280`, line `#E5E7EB`, status ok/warn/alert/err; buttons (primary `#2563EB`→`#1E40AF` r6 pad10/20, secondary, ghost, danger); cards (white, line border, r8, `0 1px 3px`); nav (navy/white/active-action); badge pills (4/10, 12px, text 100% / bg 15%); full type scale (H1 40/700/1.15 … Caption 12); Lucide defaults (outline, 1.5px, currentColor); `prefers-reduced-motion` honored.

### Deploy + verification
Deployed `dashboard/public` → `aljeel-ap-finance` Pages project (claude-runner command). Deployment **`ca3fd75a`**, confirmed **Production / main**.

- **Access gate** on the real portal host `finance.aljeel.accordpartners.ai` — `/api/v2/ping`, `/portal-v2`, `/v2/tokens.css`, `/v2/app.js` all return **302 → "Sign in ・ Cloudflare Access"**. v2 inherits Access automatically (decision G7) ✅
- **Route + assets** on the ungated production `aljeel-ap-finance.pages.dev`: `/api/v2/ping` correctly proxies to the droplet (`/v2/ping`); all 7 v2 assets serve 200 with correct MIME (`text/css`, `application/javascript`); `/portal-v2` serves my shell ✅
- **Working URLs:** `https://finance.aljeel.accordpartners.ai/portal-v2` (gated) · `https://aljeel-ap-finance.pages.dev/portal-v2` (ungated, for testing)

### ⚠️ Two things you need to know
1. **Hostname in the prompt is stale.** `aljeel-ap-files.accordpartners.ai` is a *separate, legacy* Pages project (last deployed Jun 20, not Access-gated). The current gated portal — and the claude-runner deploy target where `dashboard/public/_worker.js` lives — is **`aljeel-ap-finance` → `finance.aljeel.accordpartners.ai`**. I deployed there (correct target). I did **not** touch `aljeel-ap-files` (deploying `dashboard/public` to it could clobber the `/files/*` mirror). Saved to memory. If you genuinely want v2 reachable at `aljeel-ap-files.accordpartners.ai`, tell me and I'll confirm that project's source before deploying.

2. **Backend blocker (out of my scope).** The v2 Flask blueprint is **not registered** in the running `droplet_api_flask.py` — every `/v2/*` returns 404 (that's why the proxied `/api/v2/ping` shows the droplet's Flask 404, not `{ok:true}`). The frontend + worker are correct and ready, but the batches list will error until someone (a) adds `import droplet_api_v2; app.register_blueprint(droplet_api_v2.bp)` to `droplet_api_flask.py` and restarts Flask, and (b) confirms Access injects `Cf-Access-Authenticated-User-Email` on `/api/v2/*` for authenticated users (the worker now forwards it; the blueprint's `before_request` requires it). I left `droplet_api_flask.py` untouched per your constraints — flagging for the backend owner / Phase 5.

Root portal was **not** cut over — v1 stays default; v2 is reached at `/portal-v2` only.

[status: done rc=0]
