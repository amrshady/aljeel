# Portal-v2 Run-detail Narrow-Column Fix — 2026-06-27

Run: cl-20260627-003723-1022930 (status: done rc=0)

## Symptom
Run detail rendered ~half width vs the 1100px that Batches / Runs / Evidence use.
CFO saw big symmetric side margins only on the Run detail view.

## Root cause (the exact rule)

`#view.view` is a **flex item** — the `<main>` child of `.shell__main`, which is
`display:flex; flex-direction:column`. The rule was:

```css
.view { max-width: 1100px; margin: 0 auto; padding: …; }   /* no width */
```

`margin: 0 auto` sets **auto margins on the cross axis** (horizontal, in a column
flex container). Per flexbox, auto cross-axis margins **suppress
`align-items: stretch`** — so instead of stretching to the container, `.view` was
sized to its **content's max-content width** (clamped at 1100px), then the auto
margins centered the leftover space.

That's why it varied by route even though all routes reuse the *same* `#view` node:
- **Batches / Runs / Evidence** contain intrinsically-wide content (full-width
  `.dtable` tables with `white-space:nowrap`, dense rows) → max-content ≥ 1100px →
  clamped to **1100px**, looked correct.
- **Run detail** is short cards, a `min-width:120px`-tick timeline, and a tab strip
  → max-content ~440–640px → `.view` **collapsed to that and centered**, leaving the
  big symmetric margins.

The run-detail cards/stack/tabs/tabpanel were *already* full-width **of `.view`**
(block children) — so adding `width:100%` to those blocks would have done nothing.
The container itself was the culprit.

## The fix (one line, `dashboard/public/v2/tokens.css`)

```diff
-.view { max-width: 1100px; margin: 0 auto; padding: var(--sp-8) var(--sp-6); }
+.view { width: 100%; max-width: 1100px; margin: 0 auto; padding: var(--sp-8) var(--sp-6); }
```

`width: 100%` gives the flex item a **definite cross size** = `min(container, 1100px)`,
so it spans the full column on every route, identical left edge, centered by the
unchanged auto margins. No-op for the already-1100 views; only rescues the narrow one.
`box-sizing:border-box` is global, so padding stays inside 1100px (no overflow).
Report and Logs tabs render in `panelHost` (block child of `.view`) and their
`.report-table`/`.dtable` are `width:100%`, so they fill the now-full column too.

## Untouched / safe
- `scrollbar-gutter:stable` on `html` — intact (separate rule, not edited).
- **v1 `/portal`** — uses different assets; `tokens.css` is loaded only by
  `portal-v2.html`.
- **Auth/poll plumbing** — `app.js` fetch wrapper, `_worker.js`, `poll.js`, X-V2
  headers, run-detail behavior (polling, tabs, SPLIT download, Risk &
  Inconsistencies, lazy evidence/logs) all unchanged. Only the CSS width changed.

## Deploy
- Pages project: `aljeel-ap-finance` → deploy id **45033739**
  (`https://45033739.aljeel-ap-finance.pages.dev`).
- Verified live: deployed `/v2/tokens.css` line 203 now reads
  `.view { width: 100%; max-width: 1100px; … }`.
- Serves `finance.aljeel.accordpartners.ai/portal-v2`.
