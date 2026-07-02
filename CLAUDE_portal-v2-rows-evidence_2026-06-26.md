Both upgrades are built, deployed, and verified.

## Deploy
- **Deployment id: `10340b35`** → `https://10340b35.aljeel-ap-finance.pages.dev` (project `aljeel-ap-finance`, branch `main`, 8 files uploaded). Live behind Access at `finance.aljeel.accordpartners.ai/portal-v2`. No Flask restart (frontend-only change).

## Files changed (6)
- `v2/views/batches.js` — card grid → dense rows
- `v2/views/evidence-browse.js` — batch-level two-pane browser
- `v2/components/evidence-tree.js` — added lazy `BatchEvidenceTree` + `extractNodes`/`normNode` (old `EvidenceTree` untouched)
- `v2/components/msg-reader.js` — generalized to a `source` abstraction (runId string still works)
- `v2/api.js` — added `batchEvidenceTree/FileUrl/Msg` + `batchMsgAttachmentUrl` (additive)
- `v2/tokens.css` — `.batchrow*` + `.ev-crumb` + lazy-tree states

## TASK 1 — Dense batch rows (exact DOM/CSS)
Each batch is a `.batchrow.is-link` — a **CSS grid** (`grid-template-areas: "id items status figure actions"`, `min-height:60px`, `padding:8px 20px`), wrapped in a single bordered `.batchrows` container with `1px var(--line)` dividers between rows (no boxed cards). Columns: **(1)** `.batchrow__idtext` — `font-size:var(--fs-h5); font-weight:600; color:var(--navy)` + `layers` icon; **(2)** `.batchrow__items` muted folder icon + tabular count; **(3)** `stateChip` pill + relative time (or a `No runs` muted badge); **(4)** `.batchrow__figure` — `N flagged · SAR <value> at risk` with prominent ink tabular numbers; **(5)** `.batchrow__actions` — primary **Run** (unchanged `startRun`) + ghost **Open** (`#/b/<id>`).
- **Gold, used in exactly 4 deliberate spots, never as fill/button:** row hover sets `border-left-color: var(--gold)` (3px rail); `.batchrow--active` keeps that rail persistently for any batch whose last run is still in flight (milestone marker); `.batchrow__sar` gets a `2px solid var(--gold)` underline on the SAR-at-risk value; selected evidence-tree node gets an `inset 2px 0 0 var(--gold)` left-rule. Hover bg is `var(--sage)`.
- Toolbar (search/chips-with-counts/sort) + summary strip preserved; a thin column-label header aligns to the grid. All filter/sort/search/Run/row-click wiring is byte-for-byte intact.

## TASK 2 — Batch-level Evidence viewer
`#/evidence` lists batches (cards → `#/evidence/<batch>`); `#/evidence/<batch>` is a two-pane browser fetching **batch-level** endpoints via `?path=` (lazy: each folder fetches children on expand), so all folders are visible regardless of run state. Left = collapsible folder tree with kind icons (`file-text`/`mail`/`image`) + sizes + item count header; right = preview pane (PDF inline `<iframe>`, parsed `.msg`/`.eml` email card, inline images, download fallback) + a path breadcrumb. Shape-tolerant (`extractNodes` accepts `nodes|children|entries|[]` or flat folders+files). **Graceful degradation:** a 404/425/not-ready tree → a static "Evidence indexing…" notice with a Retry — never a crash or spinner loop.

## Plumbing untouched (verified)
`apiFetch` intact (`app.js:43`); `_worker.js`, `poll.js`, `run-trigger.js`, `app.js`, per-run `evidence.js`/`run-detail.js` all carry **pre-session mtimes** (≤17:07; my edits 17:28+). Worker still proxies `/api/v2/*`→`/v2/*` (`_worker.js:387`) — no worker change needed. v1 `/portal` route logic unchanged in the worker; everything still Access-gated (prod returns the Access 302 for unauthenticated requests). All new assets confirmed live on the deploy URL.

**What Amr sees now:** the Batches landing is a tight, scannable finance-ops list — navy batch ids, aligned tabular flagged/SAR figures with a tasteful gold underline and a gold rail on the live run — and the Evidence section finally opens *every* folder of a batch (emails, invoices, attachments) with inline PDF/email/image preview, even mid-run or before any run exists.

One note: the batch evidence endpoints are Codex's parallel work — if they aren't live at the moment Amr opens Evidence, he'll see the clean "Evidence indexing…" state with Retry rather than an error, and it'll light up automatically once those endpoints respond.

[status: done rc=0]
