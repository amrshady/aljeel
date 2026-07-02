# Claude Run — Portal v2 Coverage Frontend
Run id: cl-20260626-174347-453191
Status: done rc=0
Date: 2026-06-26

The SAR→coverage swap is implemented, deployed, and verified.

## What changed

**`views/batches.js`** (the only batch-row logic file):
- 4th-column figure now leads with **coverage**: `fmtPct(last.coverage_pct)` → e.g. `87.5%` (integers stay clean: `90%`), rendered as the bold-ink milestone figure `.batchrow__coverage`.
- **Flagged** kept as a smaller, muted secondary stat (`.batchrow__secondary`) in the same cell: `… coverage · 3 flagged`.
- **Caption beneath**: `<gl_cells_blank> blank cells` (`.batchrow__cap`, muted), pluralized; tinted **warn `#D97706`** only when `coverage_pct < 80` (the caption, never the number — status color, not gold).
- **SAR-at-risk dropped** from the row; `fmtMoney` import removed.
- Header label `Flagged · SAR at risk` → **`Flagged · Coverage`**.
- **Fallback**: when `coverage_pct` is null/undefined (older runs / pre-deploy backend) it renders `— coverage` (muted `.batchrow__covnone`) and still shows flagged — never NaN%, never crashes.

**`tokens.css`**:
- The **2px gold underline (`#B8860B`) moved from `.batchrow__sar` to `.batchrow__coverage`** — the milestone figure is now coverage. Gold rail-on-hover and rail-for-live-run untouched.

## Verification
- coverage_pct renders with the gold underline; batchrow__coverage + gold rule live on the deployment.
- batchrow__sar and fmtMoney no longer present in deployed batches.js; SAR-at-risk gone from the batch row.
- Header relabeled to `Flagged · Coverage`.
- Fallback path confirmed; no NaN.
- sar_at_risk still in payload and still used by runs-all.js / runs.js (untouched).
- v1 `/portal` untouched. Only batches.js + tokens.css changed.
- JS syntax + CSS brace balance check pass.

**Deploy id: `1e751208`** (https://1e751208.aljeel-ap-finance.pages.dev → finance.aljeel.accordpartners.ai/portal-v2)
