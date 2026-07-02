# Portal v2 — Run-detail cleanups (2026-06-27)

Run: cl-20260627-004429-1032827 — status done rc=0

Both changes confirmed live on the deployed assets. Done.

## Summary

Two Run-detail cleanups for Portal v2, deployed to Pages `aljeel-ap-finance`.

**Deploy id:** `a202202d` → https://a202202d.aljeel-ap-finance.pages.dev (serves finance.aljeel.accordpartners.ai/portal-v2)

### Exact diffs

**1. `dashboard/public/v2/views/run-detail.js` — removed the redundant quicklinks row**
```diff
   const download = DownloadButton(runId);
-  // One-click cross-links into the other tabs (selectTab is hoisted below). This
-  // is what makes the "Risk & Inconsistencies" report reachable in a single click
-  // from a succeeded run's landing (Output) tab.
-  const quicklinks = el('div', { class: 'row gap-2', style: 'flex-wrap:wrap;margin-top:8px' }, [
-    el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => selectTab('exceptions') },
-      [icon('alert-triangle'), 'Risk & Inconsistencies']),
-    el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => selectTab('evidence') },
-      [icon('folder'), 'Browse evidence']),
-  ]);
   const outputPanel = el('div', { class: 'stack gap-3' }, [
     el('h3', { class: 'h5', text: 'Reconciliation output' }),
     el('p', { class: 'body-s muted', text: 'The split-by-employee spreadsheet — the only download Portal v2 serves.' }),
     download.node,
-    quicklinks,
   ]);
```

**2. `dashboard/public/v2/components/download-button.js` — shortened the button label**
```diff
-  const btn = el('a', { class: 'btn btn--primary', role: 'button' }, [icon('download'), 'Download SPLIT']);
+  const btn = el('a', { class: 'btn btn--primary', role: 'button' }, [icon('download'), 'Download']);
```

### Confirmations
- **Tabs still work** — `selectTab` is untouched and still wired to the tab strip (`addEventListener('click', …)`), the on-mount `selectTab('output')`, and the lazy-load hooks (evidence/report/logs). Only the duplicate cross-link buttons were removed; no dangling `quicklinks` reference remains (`grep -c` = 0). `node --check` passed on both files.
- **Download still serves the SPLIT** — only the visible button text changed to `Download` (Lucide `download` icon kept). The `downloadUrl(runId)` href → `GET /api/v2/runs/<id>/download`, the `artifacts.split` gating, the artifact name/size/sha line, and the helper caption are all unchanged.
- **`runs-all.js` untouched** — it uses its own inline `<a>` labeled `SPLIT` (already concise), not the `DownloadButton` component.
- **Auth/poll/width/v1 untouched** — no changes to `app.js`, `_worker.js`, `poll.js`, X-V2 headers, the `.view width:100%;max-width:1100px` fix (earlier deploy 45033739), or v1 `/portal`.
