# Done — reload loop killed, identity wired, deployed & verified

The page is now stable. Production deployment **`c1ad1c66`** is live on `finance.aljeel.accordpartners.ai`.

## One correction to the diagnosis (load-bearing)
The diagnosis said *"Cloudflare Access BYPASSES /api/*"*. **It does not.** I tested unauthenticated through Cloudflare:
- `v1 /api/ping` → **302 to Access IdP**
- `v2 /api/v2/ping` and `/api/v2/batches` → **302 to Access IdP**

Access gates *every* path on this host, so for an authenticated browser **Access itself injects `Cf-Access-Authenticated-User-Email`** before the worker runs. That changed Part B from "always verify+inject" to **"trust the injected header, fall back to my own JWT verification only if it's absent"** — otherwise I'd have *rejected requests Access already authenticated* (a regression on the working path). Bonus: the Access login 302 leaked the **application AUD** in its `meta` token, so I now enforce `aud` too.

---

## FIX PART A — `dashboard/public/v2/app.js` (the loop kill)
The three `location.reload()` calls in `apiFetch()` are gone. Diff in spirit:

```diff
-  } catch (err) {
-    if (document.visibilityState === 'visible') location.reload();   // network err → reload
-    throw new ApiError(0, 'network_error', …);
+  } catch (err) {
+    throw new ApiError(0, 'network_error', `Network error: ${err.message}`);  // retryable, no reload
   }
-  if (res.redirected) { if (cross-origin) location.reload(); }        // every redirect → reload
+  if (res.redirected && crossOrigin) throw reauthOnce();             // latched: at most ONCE
-  if (res.status === 401 || res.status === 403) {
-    location.reload();                                                // <-- THE LOOP
-    throw new ApiError(res.status, 'access_required', 'Re-authenticating…');
+  if (res.status === 401 || res.status === 403) {
+    // plain JSON 401/403 from our API → NEVER reload; surface for Retry / Sign-in
+    throw new ApiError(res.status, (payload&&payload.error)||'auth_required', …);
```
- `reauthOnce()` reloads **only** on a genuine cross-origin bounce to the IdP, guarded by a `sessionStorage` latch (`v2:reauth-attempted`) so it can fire at most once; the latch clears on the next successful call.
- New shared `errorState(err, {onRetry})` renders **"Couldn't load — Retry"**, plus a user-clicked **"Sign in again"** (single, manual reload) for 401/403. Wired into `batches.js`, `runs.js`, `run-detail.js`, and the router's `renderFatal`. Batches now shows a retry card instead of spinning skeletons forever.

The only remaining `location.reload()` references are inside `reauthOnce()` (latched) and the "Sign in again" button — confirmed by grep on the deployed module.

## FIX PART B — `dashboard/public/_worker.js` (verify + inject, edge-side)
```diff
   if (p.startsWith('/api/v2/')) {
-    return proxyToDroplet(request, p.replace(/^\/api/, ''), url.search, false);
+    let email = request.headers.get('Cf-Access-Authenticated-User-Email'); // trusted: CF strips client Cf-*
+    if (!email) email = await verifyAccessEmail(request, env);             // bypass fallback
+    if (!email) return jsonResponse({ error:'access_required', detail:'…sign in again.' }, 401); // JSON, not redirect
+    const h = new Headers(request.headers); h.set('Cf-Access-Authenticated-User-Email', email);
+    return proxyToDroplet(new Request(request, { headers: h }), p.replace(/^\/api/, ''), url.search, false);
   }
```
**JWT verification approach** (new helpers): read token from `Cf-Access-Jwt-Assertion` header else the `CF_Authorization` cookie → base64url-decode → check `alg=RS256` → import the matching `kid` from `https://akstat.cloudflareaccess.com/cdn-cgi/access/certs` as a WebCrypto `RSASSA-PKCS1-v1_5/SHA-256` key → `crypto.subtle.verify` the signature → enforce `exp`, `nbf`, `iss=https://akstat.cloudflareaccess.com`, and **`aud=f0e8c6db…`** → extract `email` (then `identity.email`, then an `@`-bearing `sub`). JWKS cached module-scope for 1h. `env.ACCESS_AUD` overrides the baked AUD if the app is ever rotated. v1, KV, `/evidence/*`, `/files/*` branches untouched.

---

## Verification through Cloudflare
| Check | Result |
|---|---|
| (a) Loop-kill live | Deployed `app.js` has **no** reload on 401; only the latched `reauthOnce` + manual button ✅ |
| (c) Unauth `/api/v2/batches` | **401 JSON** `{"error":"access_required",…}` — no redirect, no loop ✅ |
| Spoof-proof | Sending a fake `Cf-Access-Authenticated-User-Email` → still **401** (Cloudflare strips client `Cf-*`) ✅ |
| (d) v1 intact | `/api/ping` → **200** `{"status":"ok"}`; no v1 file touched ✅ |
| JWT algo | **8/8** unit tests (valid→email, expired/bad-iss/tampered/unknown-kid→null, identity fallback, aud match/mismatch) ✅ |
| Live certs | Fetched JWKS + imported **both** real Access RSA keys via WebCrypto ✅ |

**(b) the authenticated 200-data path I could not fully exercise from the shell** — I have no browser `CF_Authorization` cookie, and Cloudflare strips any spoofed `Cf-*` header, so I can't forge identity from curl (this is by design and is itself the security guarantee). I verified that path by unit-reasoning + the cert/token tests above, **and** by the structural fact that on prod Access injects the trusted header itself, which the worker now forwards → droplet `/v2/batches` (already confirmed healthy at 200/0.13s with the header present).

## Residual follow-up
- **None blocking.** `droplet_api_v2.py` did **not** need editing — the worker satisfies its `Cf-Access-Authenticated-User-Email` gate. (I deliberately left it untouched.)
- Optional hardening: set an `ACCESS_AUD` Pages env var so the AUD isn't only baked into the worker source (the code already prefers the env var).
- The corrected Access model (no bypass; gate+inject; AUD `f0e8c6db…`) is saved to memory so future prompts carrying the stale "bypass" premise don't reintroduce confusion.

Rollback if ever needed: the v2 identity block and the JWT helpers are self-contained additions; reverting them restores the prior proxy-through behavior, and the app.js change is independent of it.

[status: done rc=0]
