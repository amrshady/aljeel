# Portal v2 401 Fix #3 — CF Cf-* Header Strip (Root Cause) — 2026-06-26

Run: cl-20260626-164929-379277 — status done rc=0

The fix is live and verified end-to-end. Here's the full report.

## Root cause — confirmed
The Pages worker proxies `/api/v2/*` → tunnel hostname `aljeel-ap.accordpartners.ai`, injecting identity as `Cf-Access-Authenticated-User-Email`. **Cloudflare strips all client-supplied `Cf-*` headers at its edge, including on the tunnel hop**, so that header was deleted before reaching Flask. The v2 `before_request` gate saw no header → `401 access_header_required`. Identity resolution was never the problem.

Proven live just now: tunnel + `Cf-Access-Authenticated-User-Email` → **401** (header stripped), while v1 `/batches` on the same tunnel → **200**.

## Fix — exact diffs

**`dashboard/public/_worker.js`** (2 spots):
- v2 proxy block — after setting the Cf-Access header on `authedHeaders`, also:
  ```js
  authedHeaders.set('X-V2-User-Email', email);
  if (env.V2_PROXY_SECRET) authedHeaders.set('X-V2-Proxy-Secret', env.V2_PROXY_SECRET);
  ```
- `proxyToDroplet` GET branch — it rebuilds headers from scratch on GET, so explicitly forward the survivors:
  ```js
  const v2Email = request.headers.get('X-V2-User-Email');
  if (v2Email) fetchOpts.headers['X-V2-User-Email'] = v2Email;
  const v2Secret = request.headers.get('X-V2-Proxy-Secret');
  if (v2Secret) fetchOpts.headers['X-V2-Proxy-Secret'] = v2Secret;
  ```
  (POST/PUT/PATCH already forward full `request.headers`, so they pick these up automatically.)

**`scripts/droplet_api_v2.py`** — new `_request_email()` helper + gate now calls it:
```python
PROXY_EMAIL_HEADER = "X-V2-User-Email"
PROXY_SECRET_HEADER = "X-V2-Proxy-Secret"
V2_PROXY_SECRET = os.environ.get("V2_PROXY_SECRET", "").strip()
```
`_request_email()`: trusts `Cf-Access-…` if present; else trusts `X-V2-User-Email` **only if** `X-V2-Proxy-Secret` matches the configured secret (and accepts-with-warning if no secret is configured, so it can never hard-block). Gate: `if not _request_email(): 401`. The email isn't consumed anywhere else in the blueprint.

## Proxy secret — wired end-to-end
The tunnel hostname is **not** Access-gated (v1 `/batches` = 200 with no auth), so a bare `X-V2-User-Email` would otherwise be forgeable by anyone. Generated a 64-char secret, wrote it to `/home/clawdbot/.openclaw/.env` as `V2_PROXY_SECRET=…`, and uploaded it as the Pages **production** secret `V2_PROXY_SECRET` (`✨ Success! Uploaded secret`). The worker sends it; Flask requires it.

## Flask restart — confirmed
No run active (`locked:false`). Flask is a **systemd** service (`aljeel-flask.service`, `Restart=always`), not nohup — `pkill` triggered a clean systemd respawn (new PID 385613, reloaded `.env` + new code). Health check `200`.

## Deploy
`✨ Deployment complete!` — `aljeel-ap-finance`, deploy id **`689ac931`** (https://689ac931.aljeel-ap-finance.pages.dev).

## Verifications (all live)
| Check | Result |
|---|---|
| tunnel + Cf-Access only | **401** (proves CF strips Cf-* — root cause) |
| tunnel + X-V2-User-Email, no secret | **401** (forgery blocked) |
| tunnel + X-V2-User-Email + secret (the worker's path) | **200**, real JSON, **11 batches** |
| Local gate: Cf-Access / X-V2+secret / wrong secret / no secret / none | 200 / 200 / 401 / 401 / 401 |
| v1 tunnel `/batches` | **200** (untouched) |
| prod `/api/v2/whoami`, `/api/v2/batches`, `/portal-v2`, `/api/batches` (no cookie) | all **302 → Access login**, AUD `f0e8c6db…` intact |

The **401-vs-200 difference on cases 2 and 3** (identical email header, differing only by the secret) is the proof that `X-V2-User-Email` and `X-V2-Proxy-Secret` *survive* the CF edge — if they were stripped, case 3 couldn't be 200.

Note: the prompt predicted the bare-`X-V2-User-Email` tunnel curl would be 200; because the secret was wired (better security), that case is now correctly **401**, and the worker's secreted path is the 200.

## The one in-browser check for Amr
**Hard-refresh `https://finance.aljeel.accordpartners.ai/portal-v2`** — batches should now load. Backup: open `https://finance.aljeel.accordpartners.ai/api/v2/batches` directly — should be **JSON (11 batches), not a 401**.
