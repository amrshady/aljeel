# Portal v2 — Evidence Viewer Tree-Parsing Fix

**Run:** cl-20260626-174547-456528 (done rc=0)
**Date:** 2026-06-26

## Root cause
`/v2/batches/<id>/evidence/tree` returns nodes nested under `resp.tree.children`
(the `tree` field is a wrapper node for the evidence root itself). `extractNodes`
only checked top-level `nodes/children/entries/items` and flat `folders/files`, so
it never unwrapped `resp.tree.children` → returned `[]` → empty-state ("No evidence
files") for every batch.

## The exact `extractNodes` diff
Inserted a `resp.tree` branch (placed **before** the generic key loop so it wins):

```js
  if (Array.isArray(resp)) return resp.map(normNode).filter(Boolean);
  // Batch endpoint shape: { …, tree: { type:'dir', rel:'', children:[…] } }.
  // `tree` is a wrapper node for the (sub)directory itself; we want its CHILDREN
  // as the top-level list so the date folders (01jun/02jun/…) become the roots,
  // not a single empty-named wrapper. The backend nests the full subtree inline,
  // so each child already carries its own grandchildren — normNode recurses.
  if (resp.tree && typeof resp.tree === 'object') {
    if (Array.isArray(resp.tree.children)) return resp.tree.children.map(normNode).filter(Boolean);
    return [normNode(resp.tree)].filter(Boolean);
  }
```

All existing fallbacks kept; added `.filter(Boolean)` to each. Per-run snapshot path untouched.

## Verification (reasoned against `droplet_api_v2.py`)
- `_evidence_node` sets `rel === path === full posix relpath`. `normNode` prefers `rel` → correct; folder lazy-fetch and file/msg URLs all send `?path=<rel>`.
- `_build_evidence_tree` returns the full nested tree (max_depth 8) inline — every dir node carries a `children` array; `normNode` recurses; nested folders render, no double lazy-fetch.
- J26-925 (node_count 176, 5 top children) and J26-954 now yield date folders → ticket folders → files. File click passes `{rel, ext, kind}`; `MsgReader.open` routes on `kind` (pdf→inline iframe, email→parsed card, image→img).
- Auth/poll plumbing (`_worker.js`, `app.js`, `poll.js`) and v1 untouched.

## Deploy
- **Deploy id: `33a79ab8`** → https://33a79ab8.aljeel-ap-finance.pages.dev
- Project `aljeel-ap-finance`, branch main. Only `components/evidence-tree.js` changed.

---

## Related: coverage% swap (separate change)
- Runs: cx-20260626-174319-452619 (codex, done rc=0) / cl-20260626-174347-453191 (claude, done rc=0)
- Batch rows now lead with GL allocation coverage (e.g. `87.5% coverage · 3 flagged`, gold underline, `12 blank cells` caption, amber <80%) instead of SAR-at-risk.
- **Deploy id: `1e751208`** → https://1e751208.aljeel-ap-finance.pages.dev
- Only `batches.js` + `tokens.css` changed; `sar_at_risk` still in payload, still used by runs views.
