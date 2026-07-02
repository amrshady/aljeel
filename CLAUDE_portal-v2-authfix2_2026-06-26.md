# Portal v2 Auth-Loop Fix #2 — Claude Run Report
**Run:** cl-20260626-111449-4112717
**Date:** 2026-06-26
**Deploy id:** aa4aa2e4 (aljeel-ap-finance Pages)

## Root cause

**Bug B (the loop) was the real problem — bug A's "prime suspect" (hardcoded ACCESS_AUD reject) was a red herring.**

The unauth probe proved **Cloudflare Access gates `/api/v2/*` (no bypass)** — it returns a 302 to `akstat.cloudflareaccess.com`, and that 302's `meta=` token carries `aud = f0e8c6db…95837…238b5` — **exactly the baked `ACCESS_AUD`**. So the baked AUD was *correct*, not wrong. The AUD hard-reject was never what failed an authenticated user.

The actual culprit: `app.js` `reauthOnce()` called `location.reload()` whenever a `/api/v2/*` fetch returned a **cross-origin redirect** — which is precisely what Access does when it 302s an XHR to renew the app session. Reload → re-fetch → 302 → flash of "Re-authenticating…" / errorState → repeat. That's the flicker/loop, and the flash the user read as "401 / reauthentication required."

## What changed

### `dashboard/public/_worker.js` — hardened identity resolution
- `verifyAccessEmail()` now gates on **signature + iss + exp only** (JWKS is org-scoped, so sufficient). **AUD is non-fatal**: matched → noted; mismatch/unset → ignored, never rejects a signature-valid token. Returns `{email, audMatched}`.
- Edge-injected `Cf-Access-Authenticated-User-Email` trusted first (method `header`); else JWT path (method `jwt`).
- Valid token with no email claim → sentinel `access-verified+<sub>@akstat.cloudflareaccess.com` so droplet header-presence gate passes. **Only for a cryptographically valid token** — invalid/absent → clean JSON 401, no redirect.
- Diagnostics: `GET /api/v2/whoami` → `{ok,email,method,aud_matched}`, plus `X-V2-Auth-Method` / `X-V2-Aud-Matched` headers on proxied v2 responses.

### `dashboard/public/v2/app.js` — killed the loop
- **Deleted `reauthOnce`, `REAUTH_LATCH`, and success-path `sessionStorage.removeItem`.** No `location.reload()` in any automatic path.
- A cross-origin redirect now `throw`s `ApiError(401,'access_required')` instead of reloading.
- Router `route()` catch now **always renders the error** (removed silent `return` that left skeletons up).
- Only `location.reload()` left is the manual **"Sign in again"** button in the static `errorState()` card.

### `droplet_api_v2.py` — NOT touched
Its `before_request` only needs the header present, which the worker injects. **No Flask restart needed** (confirmed `/current-run` unlocked regardless).

## Deploy & verification

**Deploy id: `aa4aa2e4`** (aljeel-ap-finance Pages). Verified via ungated `*.pages.dev` URL:
- ✅ `/api/v2/batches` (no token) → clean JSON 401, no redirect: `{"error":"access_required",…}`
- ✅ `/api/v2/whoami` → `{"ok":false,"email":null,"method":"none","aud_matched":null}` (route live)
- ✅ v1 `/api/ping` → `200 {"status":"ok"}`; v1 `/api/batches` → `200`
- ✅ `/` → `302 → /portal-v2.html`

Cannot forge an authenticated browser session from curl (Access won't expose the cookie to shell), so the live authed path rests on code-path reasoning + diagnostic.

## In-browser check for Amr
While signed in, open **`https://finance.aljeel.accordpartners.ai/api/v2/whoami`** — should show his email and `"method":"header"` (or `"jwt"`). If it shows his email, Batches will load. If `{"ok":false,…}`, the JSON tells which resolution step to look at next — no loop, no secrets.
