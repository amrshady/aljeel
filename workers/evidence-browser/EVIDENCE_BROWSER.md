# Evidence Browser — Reusable Document-Evidence Review System

A self-contained **evidence viewer + full-text search** surface for the AlJeel AP
pipeline. It lets a reviewer pick a batch, browse the original source documents in
a folder tree (with per-folder ticket/file counts), full-text search *inside* the
PDFs and emails, and open any file (PDF / MSG / EML / image) in an in-browser
viewer — including MSG/EML attachments.

This is the system behind **https://aljeel-ap-files.accordpartners.ai/evidence**.
It is documented here so it can be **reused for any new evidence-review surface** —
point a new CF Pages Worker at a droplet Flask API over a Cloudflare Tunnel, drop
the evidence files into `batches/<prefix>-<id>/raw/`, deploy, done.

_Last updated: 2026-06-30._

---

## 1. What it does

- **Batch picker** — lists every evidence batch on the droplet (`/api/batches`).
- **Folder tree** — walks the batch's `raw/` directory, shows nested folders with
  per-folder file counts (the "ticket counts" in the UI).
- **Full-text search inside documents** — `/evidence/search` extracts text from
  every PDF and email in a batch (cached on disk), then returns hits with the
  matching snippet. Search is *inside* the file content, not just filenames.
- **File viewer** — opens PDFs inline, renders `.msg`/`.eml` emails as structured
  JSON (from/to/subject/body + attachment list), serves images and other types
  directly.
- **MSG/EML attachment extraction** — pull an individual attachment out of an
  Outlook `.msg` or `.eml` by index and view/download it.
- **Reverse-proxied behind Cloudflare Access (OTP)** — the whole Pages host is
  OTP-gated; the Worker also re-verifies the Access JWT for the `/api/v2/*` lane.

**No database. No build step.** The frontend is one `evidence.html` SPA (vanilla
JS), the edge is one `_worker.js`, the backend is one Flask file. Evidence "source
of truth" is just files on the droplet disk.

---

## 2. Architecture

```
  Browser (OTP-gated via Cloudflare Access)
      │  GET /evidence  ,  /api/* , /evidence/* , /files/*
      ▼
  Cloudflare Pages  ── frontend/evidence.html  (SPA: batch picker, tree, search, viewer)
  Worker (worker/_worker.js)
      │  - serves dashboard assets via env.ASSETS
      │  - verifies Cloudflare Access JWT (edge identity) for /api/v2/*
      │  - proxies /evidence/* + /api/* → droplet Flask
      │  - proxies /files/*  → FILES_ORIGIN (Pages-hosted raw docs)
      │
      ▼  (HTTPS to a STABLE Cloudflare Tunnel hostname)
  https://aljeel-ap.accordpartners.ai     ← CF Tunnel  c281300c-ce87-41ac-a551-ccfddba5941f
      │
      ▼  (tunnel egress → localhost)
  Flask API  (backend/droplet_api_flask.py, :5000, systemd aljeel-flask.service)
      │  /evidence/tree | /evidence/search | /evidence/file | /evidence/msg-attachment
      │  /batches | /files/{batch} | /download/{batch}/{kind} | pipeline SSE | qa-run
      ▼
  Evidence files on disk
      /home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-<J26-id>/raw/...
      /home/clawdbot/.openclaw/workspace/aljeel/uploads/portal/...
```

**Request flow:** browser → CF Pages Worker → CF Tunnel (`aljeel-ap.accordpartners.ai`)
→ Flask `:5000` → reads the file off disk. The Worker proxies; it never holds the
evidence bytes itself (other than streaming them through).

---

## 3. File map

```
workers/evidence-browser/
├── EVIDENCE_BROWSER.md          ← this doc
├── frontend/
│   └── evidence.html            ← the whole SPA (batch picker, folder tree,
│                                   full-text search, file/email/attachment viewer)
├── worker/
│   └── _worker.js               ← CF Pages Worker: Access-JWT verify + reverse
│                                   proxy to the droplet + /files proxy + ASSETS
├── backend/
│   ├── droplet_api_flask.py     ← Flask :5000 — all /evidence/* + /api/* routes
│   └── tunnel_manager.py        ← LEGACY localhost.run fallback tunnel (see §7)
└── systemd/
    ├── aljeel-flask.service     ← runs the Flask API (User=clawdbot)
    └── aljeel-tunnel.service    ← runs tunnel_manager.py (legacy localhost.run)
```

> The **stable** path to the droplet is the **named Cloudflare Tunnel**
> (`cloudflared`, tunnel id `c281300c-…`), NOT `tunnel_manager.py`. See §7.

---

## 4. Backend routes (Flask `droplet_api_flask.py`, :5000)

Evidence routes (the core of this system):

| Route | Method | Purpose |
|---|---|---|
| `/evidence/tree?batch_id=<id>` | GET | walk `batches/jawal-<id>/raw/`, return nested folders + per-folder file list (the tree + counts) |
| `/evidence/search?batch_id=<id>&q=<query>` | GET | full-text search **inside** every PDF + email in the batch; disk-cached text index per batch; returns hits + snippets |
| `/evidence/file?batch_id=<id>&rel=<relpath>` | GET | open one file — PDF/image streamed inline; `.msg`/`.eml` parsed → structured JSON (from/to/subject/body/attachments) |
| `/evidence/msg-attachment?batch_id=<id>&rel=<relpath>&attachment=<n>` | GET | extract attachment #n from a `.msg`/`.eml` and return it |

Supporting / pipeline routes (also proxied under `/api/*`):

| Route(s) | Method | Purpose |
|---|---|---|
| `/ping`, `/status` | GET | health + run status |
| `/batches`, `/api/batches` | GET | list every evidence batch on disk |
| `/files/<batch>`, `/api/files/<batch>` | GET | which output files exist for a batch |
| `/download/<batch>/<kind>`, `/api/download/<batch>/<kind>` | GET | xlsx output straight off droplet disk |
| `/preflight-scan`, `/api/preflight-scan` | GET | pre-run sanity scan |
| `/current-run`, `/last-run`, `/run-log` | GET | run state / SSE log stream (reconnect-safe) |
| `/clear-lock`, `/api/clear-lock` | POST | clear a stale run lock |
| `/upload` | POST | accept uploaded evidence (32 MB cap) |
| `/process` | GET | run the pipeline (SSE stream) |
| `/qa-run` | POST | QA run (SSE stream) |
| `/qa-report-download` | GET | QA report markdown download |

Path-safety: every evidence path is resolved against the batch `raw/` dir and the
`(ROOT / "batches").resolve()` allowed-prefix is enforced, so `rel=` can't escape
the batch (no `../` traversal). Flask listens `host=0.0.0.0, port=5000, threaded=True`.

Env loading: on startup the Flask app reads `/home/clawdbot/.openclaw/.env` and
exports each `KEY=VALUE` into `os.environ` (this is how `CLOUDFLARE_API_TOKEN`,
`PROXY_SECRET`, etc. reach the process — they are **never** hardcoded in source).

---

## 5. The Worker (`_worker.js`) — proxy + Access-JWT verification

Two constants define the upstreams:

```js
const FILES_ORIGIN = 'https://aljeel-ap-files.pages.dev';        // raw docs (Pages)
const DROPLET_API  = 'https://aljeel-ap.accordpartners.ai';      // stable CF Tunnel
```

Routing inside `fetch(request, env)`:

- **`/evidence/*`** → `proxyToDroplet(request, p, search)` — straight reverse proxy
  to the Flask evidence routes over the tunnel.
- **`/api/<v1>`** (batches, files, download, ping, status, process, qa-run, run-log,
  clear-lock, …) → proxied to the matching Flask route (the `/api` prefix is
  stripped where the droplet route has no `/api`).
- **`/api/v2/*`** → proxied to droplet `/v2/*` **only after Access-JWT verification**
  (see below). On failure returns a clean JSON 401, never a redirect.
- **`/files/*`** (non-xlsx) → proxied to `FILES_ORIGIN/raw/...` with an
  `X-Proxy-Secret: ${env.PROXY_SECRET}` header; sets `noindex`/`no-referrer` and
  `Content-Disposition: inline` for PDFs.
- **everything else** → `env.ASSETS.fetch(request)` (serves `evidence.html`,
  `portal.html`, `portal-v2.html`, `index.html`); `/` 302-redirects to `portal-v2.html`.

### Cloudflare Access JWT verification (the `/api/v2/*` lane)

Cloudflare Access **bypasses `/api/*` at the edge** so the unauthenticated v1
droplet API keeps working — but that bypass means Access doesn't inject the
`Cf-Access-Authenticated-User-Email` identity header the v2 Flask blueprint needs.
The Worker fixes this itself, with **no Access config change**:

1. Read the Access token from the `Cf-Access-Jwt-Assertion` header (or the
   `CF_Authorization` cookie).
2. Fetch the org JWKS from `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`
   (cached 1h) and cryptographically verify signature + issuer + expiry.
3. Extract the `email` claim, set it as `Cf-Access-Authenticated-User-Email` on the
   proxied request. If only the `sub` is present, forward a derived sentinel
   `access-verified+<sub>@<team>` (still proves an authenticated session).
4. AUD match is **non-fatal** — the JWKS is already scoped to this Access org, so a
   valid signature proves identity even if the `aud` array doesn't list our tag.

Public (non-secret) identifiers in the Worker:
- `ACCESS_TEAM_DOMAIN = 'akstat.cloudflareaccess.com'`
- `ACCESS_AUD = 'f0e8c6db…238b5'` — the Access **Application Audience tag** (a public
  app identifier, same posture as the CF Access app ids in `FILES_PORTAL.md`).
  Overridable at runtime via `env.ACCESS_AUD`.

---

## 6. Frontend (`evidence.html`)

A single-file vanilla-JS SPA (~1.6 k lines):
- On load, calls `/api/batches`, renders the **batch picker**.
- Selecting a batch calls `/evidence/tree?batch_id=` → renders the **folder tree**
  with per-folder counts.
- The search box calls `/evidence/search?batch_id=&q=` → renders hits with snippets.
- Clicking a file calls `/evidence/file?batch_id=&rel=` → PDFs render inline in an
  `<iframe>`/`<embed>`; `.msg`/`.eml` render as a structured email card (the JSON
  payload) with a clickable attachment list that calls `/evidence/msg-attachment`.

No framework, no bundler — Pages serves it as a static asset via `env.ASSETS`.

---

## 7. Cloudflare Tunnel — the path to the droplet

There are **two** tunnel mechanisms in this tree; know which is which:

| Mechanism | What it is | Status |
|---|---|---|
| **Named CF Tunnel** (`cloudflared`) | `cloudflared tunnel run --token …`, config in `/etc/cloudflared/config.yml`. Maps `finance.aljeel.accordpartners.ai` and the `aljeel-ap.accordpartners.ai` hostname (tunnel id `c281300c-ce87-41ac-a551-ccfddba5941f`) → `localhost`. | **PRIMARY / stable.** The Worker's `DROPLET_API` points here. Token is held in the cloudflared process / `/etc/cloudflared/creds.json` (root) — **not** in any committed file. |
| **`tunnel_manager.py`** (systemd `aljeel-tunnel.service`) | A Python loop that opens a `localhost.run` reverse SSH tunnel (`ssh -R 80:localhost:5000 nokey@localhost.run`) and writes the ephemeral `*.lhr.life` URL into Cloudflare KV (`DROPLET_URL`). | **LEGACY fallback.** Reads its CF API token from `os.environ["CLOUDFLARE_API_TOKEN"]` (sourced from `/home/clawdbot/.openclaw/.env` via the tunnel.service `EnvironmentFile`). No secret is hardcoded. Kept for resilience / pre-CF-Tunnel compatibility. |

> If you reuse this system, prefer a **named Cloudflare Tunnel** for a stable
> hostname; `tunnel_manager.py` is only useful as a no-account ephemeral fallback.

---

## 8. systemd units

```ini
# systemd/aljeel-flask.service  → the evidence API
[Service]
User=clawdbot
WorkingDirectory=/home/clawdbot/.openclaw/workspace/aljeel
ExecStart=/usr/bin/python3 scripts/droplet_api_flask.py
Restart=always
# logs → tmp/flask.log

# systemd/aljeel-tunnel.service → legacy localhost.run tunnel
[Service]
EnvironmentFile=/home/clawdbot/.openclaw/.env   # supplies CLOUDFLARE_API_TOKEN
ExecStart=/usr/bin/python3 scripts/tunnel_manager.py
Restart=always
```

The named `cloudflared` tunnel runs as its own process (`cloudflared --no-autoupdate
tunnel run --token <token>`), separate from these two units.

---

## 9. How evidence files are organized on disk

```
/home/clawdbot/.openclaw/workspace/aljeel/
├── batches/
│   └── jawal-<J26-id>/          ← one folder per evidence batch (e.g. jawal-J26-788)
│       ├── raw/                 ← the SOURCE evidence the browser walks/searches
│       │   └── <nested folders>/<PDFs, .msg, .eml, images, …>
│       └── output/              ← generated xlsx etc. (served via /download)
└── uploads/portal/             ← evidence uploaded through the portal
```

- `/evidence/tree` and `/evidence/search` operate on `batches/jawal-<id>/raw/`.
- The full-text search index is cached per-batch on disk (rebuilt when the batch
  changes), so repeated searches are fast.
- Batch ids are normalized (`jawal-<id>`); the picker auto-discovers any folder
  dropped into `batches/`.

---

## 10. How to reuse for a NEW evidence browser (recipe)

1. **Stand up the Flask API** on a droplet: copy `backend/droplet_api_flask.py`,
   install deps (`flask`, `flask-cors`, a PDF text extractor, `msg_parser`), create
   the `batches/<prefix>-<id>/raw/` layout, install `systemd/aljeel-flask.service`
   (adjust `WorkingDirectory`/paths). It listens on `:5000`.
2. **Create a named Cloudflare Tunnel** (`cloudflared tunnel create <name>`), route a
   stable hostname (e.g. `myco-evidence.accordpartners.ai`) → `http://localhost:5000`
   in `/etc/cloudflared/config.yml`, run it as a service.
3. **Deploy the Worker + frontend** as a Cloudflare Pages project: put
   `frontend/evidence.html` (+ any other assets) at the deploy root and
   `worker/_worker.js` as the Pages advanced-mode worker. Set `DROPLET_API` to your
   new tunnel hostname and `FILES_ORIGIN` to your raw-doc origin. Bind the KV
   namespaces (`ACTIONS_KV`) and secrets (`PROXY_SECRET`, `V2_PROXY_SECRET`) the
   Worker reads.
4. **Gate it with Cloudflare Access (OTP)**: attach the custom domain to the Pages
   project, create a CF Access OTP app over the host, set `ACCESS_TEAM_DOMAIN` +
   `ACCESS_AUD` (or `env.ACCESS_AUD`) to your org/app.
5. **Drop evidence** into `batches/<prefix>-<id>/raw/` on the droplet. Open
   `https://<host>/evidence`, pick the batch — tree + search + viewer light up.

---

## 11. Cloudflare resources & secrets

| Resource | Value / id |
|---|---|
| Pages project | `aljeel-ap-files` |
| Account | main (`5157425bbabb332495954e18b1415950`) |
| Live host | `https://aljeel-ap-files.accordpartners.ai/evidence` |
| Droplet tunnel hostname | `aljeel-ap.accordpartners.ai` (Worker `DROPLET_API`) |
| CF Tunnel id | `c281300c-ce87-41ac-a551-ccfddba5941f` (aljeel-ap-droplet) |
| Access team domain | `akstat.cloudflareaccess.com` |
| Access AUD tag | `f0e8c6db95992e48f5bc86b0a64bd4ee1f01e83a912ac16a634e5903c2d238b5` |
| Worker KV | `ACTIONS_KV` (reviewer actions + session queue) |
| Worker secrets (env) | `PROXY_SECRET`, `V2_PROXY_SECRET`, `ACCESS_AUD` (optional override) |
| Droplet env | `/home/clawdbot/.openclaw/.env` holds `CLOUDFLARE_API_TOKEN` (tunnel_manager) and friends |

**All real secret values live in `/home/clawdbot/.openclaw/.env` on the droplet and
in Cloudflare Pages secret bindings — never in this repo.**

---

## 12. Gotchas (learned the hard way)

- **Cloudflare Access bypasses `/api/*` at the edge.** That's why the Worker
  re-verifies the Access JWT itself for `/api/v2/*` (the v1 droplet API stays
  unauthenticated-at-edge by design). Don't "fix" this by adding an Access policy on
  `/api/*` — it would break the v1 lane.
- **AUD match is intentionally non-fatal.** The JWKS is org-scoped, so a valid
  signature already proves identity. Forcing an exact `aud` match has bricked the v2
  lane before when the login token's `aud` array didn't include the tag.
- **Two tunnels, one droplet.** `cloudflared` (named, stable) is the real path;
  `tunnel_manager.py` (localhost.run → KV `DROPLET_URL`) is a legacy ephemeral
  fallback. Confusing them sends `DROPLET_API` to a dead `*.lhr.life` URL.
- **Path traversal is blocked by an allowed-prefix resolve** against
  `(ROOT / "batches").resolve()`. If you change the evidence root, update that guard
  or `rel=` traversal protection silently breaks.
- **The search text index is cached on disk per batch.** If extraction libraries
  change or a batch is edited in place, the cache must invalidate (it keys off the
  batch dir state + an index version constant).
- **`PROXY_SECRET` / `V2_PROXY_SECRET` are read from env (`env.PROXY_SECRET || ''`).**
  If unset, the `/files/*` proxy still runs but with an empty secret — set them in
  Pages secrets for the origin to trust the Worker.
- **Pages deploy account matters** — `aljeel-ap-files` is on the MAIN account
  (`5157425b…`), not the fleet/AI-gateway accounts.

---

## 13. Live state (as of 2026-06-30)

- **Evidence browser:** https://aljeel-ap-files.accordpartners.ai/evidence — OTP-gated,
  Accord skin.
- **Droplet:** `206.189.57.22`, Flask `:5000` via `aljeel-flask.service`, evidence in
  `~/.openclaw/workspace/aljeel/batches/jawal-<id>/raw/`.
- **Tunnel:** named CF Tunnel `c281300c-…` → `aljeel-ap.accordpartners.ai` → localhost
  (primary); `tunnel_manager.py`/`aljeel-tunnel.service` = legacy localhost.run fallback.
- **Source of truth for this codebase:** this directory in the `amrshady/aljeel` repo.
  Live copies on the AP droplet at `~/.openclaw/workspace/aljeel/`
  (`dashboard/public/evidence.html`, `dashboard/public/_worker.js`,
  `scripts/droplet_api_flask.py`, `scripts/tunnel_manager.py`).
