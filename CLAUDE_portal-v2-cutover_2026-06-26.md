Phase 9 cutover is complete, deployed, and verified. Here's the report.

## What changed (the exact diff)

A single new block at the top of `dashboard/public/_worker.js`'s `fetch` handler (right after `const p = url.pathname`) — no v1 asset was moved, renamed, or deleted:

```js
if (request.method === 'GET') {
  if (p === '/') {
    return Response.redirect(`${url.origin}/portal-v2.html`, 302);   // root → Portal v2
  }
  if (p === '/v1' || p === '/v1/') {
    return env.ASSETS.fetch(new Request(`${url.origin}/`, request));  // v1 dashboard alias
  }
}
```

**How root now serves v2:** bare `/` → `302` → `/portal-v2.html` → the `/v2` hash-routed SPA. 302 (not 301) so the flip is never browser-cached.

**Where v1 legacy lives (both entries reachable at explicit paths):**
- `/portal` → `portal.html` — the v1 portal (natural Cloudflare Pages clean URL, untouched).
- `/v1` → `index.html` — the v1 "AP Agent" dashboard that used to be the root document. An explicit alias was required because Pages canonicalizes `/index.html` → `/`, which now hits the redirect; the alias serves it from the raw ASSETS layer where `/` still equals `index.html`.

## Deploy
- Project: `aljeel-ap-finance` (via `npx wrangler@latest pages deploy public … --branch main`, CF token from `~/.openclaw/.env`).
- **Deployment id: `d88e447d`** (`https://d88e447d.aljeel-ap-finance.pages.dev`), Production / main. The legacy `aljeel-ap-files` project was not touched.

## Verification (through Cloudflare)

**Access gating intact** — on `finance.aljeel.accordpartners.ai`, every path 302s to `akstat.cloudflareaccess.com` when unauthenticated, with `redirect_url` preserving the original path: `/`, `/v1`, `/portal`, `/portal-v2.html`, `/api/ping`, `/api/v2/ping`, `/api/v2/batches`. No Access config was changed.

**Post-Access behavior** (proven on the same Worker via the non-gated pages.dev origin):
- **Root `/`** → `302` → `/portal-v2.html` → `200`, `<title>AlJeel AP — Reconciliation Portal v2</title>`. ✅
- **v1 `/v1`** → `200`, `<title>Aljeel AI Finance — AP Agent</title>`; **`/portal`** → `200`, `Accord Partners - AlJeel AP Integration Portal`. ✅
- **v1 `/api/*` responds** — `/api/ping` → `{"status":"ok"}`, `/api/status` → `200`. ✅
- **v2 `/api/v2/*` gated + functional** — returns the v2 blueprint's `access_header_required` / `401` (a clean JSON auth error, *not* a 502), confirming the proxy reaches the droplet and the auth gate works. Only the real `Cf-Access-Authenticated-User-Email` that Access injects on the prod host gets past it (Cloudflare strips client-supplied `Cf-*` headers at the edge, so it can't be spoofed from outside Access). v2 SPA assets `/v2/app.js` and `/v2/tokens.css` both `200`. ✅

## Rollback (one sentence)
Delete the `// ── Phase 9 cutover` block from `dashboard/public/_worker.js` and redeploy — `/` immediately serves the v1 `index.html` again via the ASSETS fallback, with no asset changes.
