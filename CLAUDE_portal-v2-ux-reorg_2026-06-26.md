Done. The Portal v2 frontend is reorganized into a real finance ops console and deployed.

## Deploy
- **Deployment id: `327dede4`** → `https://327dede4.aljeel-ap-finance.pages.dev` (project `aljeel-ap-finance`, branch `main`, 7 files uploaded). Live behind Access at `finance.aljeel.accordpartners.ai/portal-v2`.

## New file list
- **`views/runs-all.js`** (new) — global recent-runs view
- **`views/evidence-browse.js`** (new) — batch evidence browser
- Modified: `portal-v2.html` (shell), `app.js` (router/nav), `views/batches.js` (toolbar), `views/run-detail.js` (cross-links), `tokens.css` (shell + component CSS)

## Exact route additions
- `#/runs` → `runsAll` (global recent runs across all batches)
- `#/evidence` → batch picker · `#/evidence/<batch>` → run-picker + evidence tree
- Existing `#/`, `#/b/<batch>`, `#/b/<batch>/r/<run>` unchanged. `setBreadcrumb` + `route()` switch + sidebar highlight (`setActiveNav`) all updated.

## What was built
1. **Persistent navy sidebar** (Batches / Runs / Evidence, icon + active-blue highlight) + light top breadcrumb bar; off-canvas collapsible under 880px. Accord wordmark + product label kept.
2. **Batches view**: live search, filter chips (All / Has runs / No runs / Last run failed / succeeded, each with counts), sort dropdown (batch id / item count / last-run time), a summary strip (total · with runs · failed), and a zero-result empty state. Card click-through and the Run CTA are byte-for-byte unchanged.
3. **Global Runs view**: fans out `listBatches → listRuns(b,8)` in parallel, merges newest-first, caps at 50; table of batch · run id · status pill · started · duration · flagged · SAR-at-risk · open/SPLIT download, with status filters.
4. **Evidence discoverability**: nav entry + batch picker; per-batch it defaults to the newest succeeded run and reuses `EvidenceView`, with a run-picker dropdown and an "Open run" shortcut.
5. **Polish**: consistent `.page-head` titles + captions, skeleton loaders falling back to the existing static error card, brand hover/active states. From a succeeded run the **Risk & Inconsistencies** report is now one click (Output-tab quick-link), and the global Runs table SPLIT-downloads in one click.

## Plumbing untouched (verified)
`apiFetch` wrapper intact (`app.js:47`, `credentials:'same-origin'`); `_worker.js`, `poll.js`, `run-trigger.js`, `api.js` not modified by me. New `/v2/*.js` files serve as static assets (all 200); SPA routing is client-side hash, so no worker change was needed. Root still `302 → portal-v2.html`; **v1 `/portal` and `/v1` still 200.** Report label remains "Risk & Inconsistencies"; downloads are SPLIT-only; no SSE.

**What Amr will now see:** a structured console with a left nav to jump between Batches, a searchable/filterable/sortable batch grid, a global "Runs" history of every previous run, and a browsable Evidence section — instead of a flat wall of cards.

[status: done rc=0]
