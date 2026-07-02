# CLAUDE Run — portal-v2 SPLIT Download button full-width fix
**Run id:** cl-20260627-005816-1049064
**Date:** 2026-06-27 (UTC)
**Status:** done rc=0
**Deploy id:** `eee5e940` (Pages project `aljeel-ap-finance`, https://eee5e940.aljeel-ap-finance.pages.dev)

## Summary

The SPLIT Download button was full-width because its `.btn` (inline-flex) sat as a direct child of `.stack` (flex column → `align-items: stretch`), which stretches children on the cross-axis (width). Shortening the label couldn't help since the *box* was being stretched.

**Root cause:** flex-column stretch (parent `.stack` `align-items: stretch`), NOT label length.

**Fix** — make the button hug its content via a scoped class (approach a, brand-safe, no global `.btn` change):

### `components/download-button.js`
```diff
-  const btn = el('a', { class: 'btn btn--primary', role: 'button' }, [icon('download'), 'Download']);
+  const btn = el('a', { class: 'btn btn--primary btn--download', role: 'button' }, [icon('download'), 'Download']);
```

### `tokens.css` (after `.btn--sm`)
```diff
+/* Download button lives in a .stack (flex column, align-items:stretch); hug its
+   content so it's only as wide as the label + icon, left-aligned. Harmless in a
+   table cell where there is no cross-axis stretch to override. */
+.btn--download { align-self: flex-start; }
```

## Verification
- **Content-width now:** `align-self: flex-start` overrides parent's `align-items: stretch`; `<a>` sized to inline-flex content, left-aligned at top of Output download block. Node structure unchanged. `.btn` `white-space: nowrap` untouched.
- **Disabled state:** `update()` only toggles `is-disabled`; never strips `btn--download` → disabled state also content-width.
- **runs-all (global Runs view):** same component, but button lives in a table cell with no flex-column parent → `align-self` inert, no visual change.
- Auth/poll plumbing, width fix, run-detail behavior, SPLIT-only download URL, and v1 `/portal` untouched. Primary button stays action-blue `#2563EB`. Download still resolves to `GET /api/v2/runs/<id>/download`.
