# Files Portal — Reusable KB Upload System

A self-contained, multi-tenant file-upload portal built on **Cloudflare Pages +
Functions + DigitalOcean Spaces**, with a droplet-side sync poller that mirrors
uploads into a local KB directory for AI-agent indexing.

This is the system behind **https://files-aljeel.accordpartners.ai** (the Aljeel
AP "Knowledge Base" portal with the **Al Jawal** and **Asateel** tabs). It is
documented here so it can be **reused for any new upload portal** — point it at a
new Spaces bucket + a new tenant, deploy, done.

---

## 1. What it does

- Browser drag-and-drop upload (files OR whole folders) → **direct PUT to DO
  Spaces** via a Worker-signed presigned URL (bytes never pass through the Worker).
- Dropbox-style **folder browsing** with per-folder item counts and badges.
- **Archive / restore** files (soft-delete: a KV flag, bytes stay in Spaces).
- **Multi-tenant**: one codebase serves many portals, switched by `?tenant=`
  and/or hostname. Each tenant = one Spaces bucket + one key prefix.
- **Cloudflare Access OTP** gates the whole surface; the Worker re-checks the
  tenant allowlist for defense-in-depth.
- A 30-day **audit log** of upload/archive/restore events in KV (`/log` page).
- A droplet-side **sync poller** (`kb-sync.sh`, systemd timer, every 60s) mirrors
  Spaces → local volume so an on-droplet AI agent indexes the files.

**No database. No build step. No node_modules at runtime.** ~150 KB of source:
one `index.html`, one Worker file (`functions/api/[[path]].js`), a few icons.

---

## 2. Architecture

```
  Browser (OTP-gated)
      │  drag-drop
      ▼
  Cloudflare Pages  ── site/index.html (SPA, vanilla JS, tab switcher)
      │
      │  /api/*  (Pages Functions)
      ▼
  Worker (functions/api/[[path]].js)
      │  - signs S3 presigned PUT/GET (hand-rolled AWS SigV4, no SDK)
      │  - archive flags + audit log in KV
      │
      ├──► DO Spaces bucket  (source of truth for bytes)
      └──► Cloudflare KV     (archived:<tenant>:<path>, event:<tenant>:<id>)

  ── meanwhile, on the droplet ──
  kb-sync.sh (systemd timer, 60s)
      │  rclone copy spaces:<bucket>/<prefix> → /mnt/<vol>/current/
      │  reads archive flags from /api/files, moves archived → /archive/
      │  hash-diffs the tree; on change → openclaw memory index --force
      ▼
  Local KB dir  →  AI agent indexes it
```

**Bytes flow:** browser → (presigned PUT) → Spaces → (rclone pull) → droplet KB.
The Worker only signs URLs and tracks metadata; it never proxies file bytes.

---

## 3. File map

```
workers/files-portal/
├── FILES_PORTAL.md            ← this doc
├── site/                      ← Cloudflare Pages assets (the SPA)
│   ├── index.html             ← the whole frontend (tabs, dropzone, file list)
│   ├── log.html               ← /log audit-trail viewer
│   ├── _routes.json           ← tells Pages which paths hit Functions (/api/*)
│   ├── favicon.svg / favicon-32.png / apple-touch-icon.png
├── functions/api/
│   └── [[path]].js            ← the Worker: all /api/* endpoints + SigV4 signer
└── droplet-sync/              ← runs ON the droplet, NOT on Cloudflare
    ├── kb-sync.sh             ← Spaces→local poller (installed at /usr/local/bin/)
    ├── kb-sync.service        ← systemd unit
    ├── kb-sync.timer          ← runs every 60s
    ├── extract-one.mjs        ← per-file text extraction (PDF/DOCX/XLSX/MSG → text for indexing)
    └── parallel-reindex.sh    ← bulk reindex helper
```

---

## 4. Multi-tenant model (THE reusable part)

Two config blocks define every tenant. Add a tenant = add one line to each.

### Worker (`functions/api/[[path]].js`)

```js
// bucket + region + key prefix. Multiple tenants may SHARE a bucket using
// isolated prefixes (this is how Asateel sits beside Jawal in one bucket).
const TENANT_BUCKETS = {
  maher:       { bucket: 'regent-maher-kb',   region: 'sfo3', prefix: 'current/' },
  marwan:      { bucket: 'regent-marwan-kb',  region: 'sfo3', prefix: 'current/' },
  'aljeel-ap': { bucket: 'accord-aljeel-ap-kb', region: 'sfo3', prefix: 'current/' },
  asateel:     { bucket: 'accord-aljeel-ap-kb', region: 'sfo3', prefix: 'asateel/current/' },
};

// who can hit which tenant (defense-in-depth on top of CF Access).
// '@domain.com' matches any address in that domain; literals match exactly.
const TENANT_ACCESS = {
  maher:       ['amr@accordpartners.ai', 'malik@accordpartners.ai', '@aljeel.com'],
  // ... one line per tenant
};
```

### Frontend (`site/index.html`)

```js
const TENANTS = {
  'aljeel-ap': { name: 'Al Jawal', label: 'Finance Agent', brand: 'accord', icon: 'A' },
  asateel:     { name: 'Asateel',  label: 'Finance Agent', brand: 'accord', icon: 'A' },
};
// which tabs show on which hostname:
const SITE_TENANTS = location.hostname.includes('accordpartners')
  ? ['aljeel-ap', 'asateel']
  : ['maher', 'marwan'];
```

`data-brand="accord"` vs `"regent"` on `<html>` switches the colour skin.

---

## 5. How to add a NEW portal (recipe)

1. **Create a Spaces bucket** (DO console → Spaces → sfo3) e.g. `accord-newco-kb`.
   Set a CORS rule allowing `PUT` from your portal hostname (see §7).
2. **Add the tenant** to `TENANT_BUCKETS` + `TENANT_ACCESS` (worker) and `TENANTS`
   + `SITE_TENANTS` (frontend). Pick a `prefix` (`current/` for a fresh bucket, or
   `something/current/` to share an existing bucket — the Asateel pattern).
3. **Deploy** (see §6).
4. **Custom domain + Access**: attach `files-<newco>.accordpartners.ai` to the
   Pages project, create a CF Access OTP app with the email allowlist.
5. **Wire the droplet sync** (optional — only if an on-droplet agent must index
   the files): add an rclone pull for the new bucket/prefix in `kb-sync.sh`.

### The "share a bucket, add a tab" pattern (minimal-disruption)

Used for Asateel (Jun 30 2026). One bucket `accord-aljeel-ap-kb`, two prefixes:
- `current/`         → **Al Jawal** tab (existing data, untouched)
- `asateel/current/` → **Asateel** tab (new, isolated)

In the Worker, every hardcoded `current/` was replaced with `cfg.prefix` so each
tenant reads/writes its own prefix. Zero new infra, existing data never moved.

---

## 6. Deploy

The portal is a Cloudflare Pages project. Assets in `site/`, Functions in
`functions/` — Pages auto-detects `functions/` at the deploy root, so stage them
together:

```bash
# from a checkout of this dir
BUILD=/tmp/files-portal-build
rm -rf "$BUILD" && mkdir -p "$BUILD"
cp -r site/* "$BUILD"/
cp -r functions "$BUILD"/functions

CLOUDFLARE_API_TOKEN="<main-account-pages-token>" \
CLOUDFLARE_ACCOUNT_ID="5157425bbabb332495954e18b1415950" \
  npx wrangler@latest pages deploy "$BUILD" \
    --project-name regent-files \
    --commit-dirty=true --branch main
```

- **Pages project:** `regent-files` (serves `files-aljeel.accordpartners.ai`,
  `files-aljeel.myregent.ai`, `regent-files.pages.dev`).
- **Account:** main (`5157425bbabb332495954e18b1415950`). Token in Malik
  `INFRA.md` / `TOOLS.md` (the `cfut_…` token).
- `_routes.json` (`{"include":["/api/*"]}`) keeps static assets off the Worker.
- `models.*`-style hot reload does not apply; a deploy is the unit of change.

> For a brand-new isolated project (so it can't touch other tenants), create a
> new Pages project name and attach only its own domain — same source, different
> `--project-name`.

---

## 7. Required Cloudflare resources & secrets

| Resource | Value / id |
|---|---|
| Pages project | `regent-files` |
| KV namespace | `regent-files-kv` (id `756a7e4b83354e54bedf5a84f5fa5d1f`), bound as `REGENT_FILES_KV` |
| Worker env vars | `SPACES_ACCESS_KEY_ID`, `SPACES_SECRET_ACCESS_KEY` (sign Spaces SigV4), `DROPLET_SYNC_TOKEN` (shared secret w/ poller), `DEV_MODE` (optional) |
| CF Access (Accord) | app id `0494452e-39b4-40d0-80d0-d79aa254fb4c` |
| CF Access (Regent) | app id `ee2463f4-6d5b-4efa-8342-5a31201c05aa` |
| OTP IdP | `ee15513b-f9df-4211-a38f-13cbe51b6e0d` (shared) |

**Set Worker secrets:**
```bash
echo "<key>"    | npx wrangler pages secret put SPACES_ACCESS_KEY_ID     --project-name regent-files
echo "<secret>" | npx wrangler pages secret put SPACES_SECRET_ACCESS_KEY --project-name regent-files
```

**Spaces CORS** (per bucket — required or browser PUT 403s on preflight):
allow `PUT, GET` from `https://files-<tenant>.accordpartners.ai` (and
`…myregent.ai` for Regent tenants), headers `*`, max-age 3000.

---

## 8. Droplet sync (`kb-sync.sh`) — only if an on-droplet agent indexes the files

Installed at `/usr/local/bin/kb-sync.sh`, run by `kb-sync.service` +
`kb-sync.timer` (every 60s). Env in `/etc/kb-sync.env` (root, 0600):

```
TENANT=aljeel-ap
BUCKET=accord-aljeel-ap-kb
VOLUME=/mnt/aljeel_ap_kb
FILES_API=https://files-aljeel.accordpartners.ai/api
SYNC_TOKEN=<shared secret matching DROPLET_SYNC_TOKEN>
```

What each run does:
1. `rclone copy spaces:<BUCKET>/<prefix> → <VOLUME>/current/` (new + updated).
2. Reconcile removals: files gone from Spaces → move local copy to `archive/`.
3. Apply KV archive flags from `/api/files` → move archived files to `archive/`.
4. Hash-diff the tree; on change → `openclaw memory index --force` (agent reindex).

### The Asateel mingle (the §5 sync-wire example)

A second prefix is pulled into a **subfolder of the same KB dir** so the agent
indexes both Jawal and Asateel under one root (the recursive hash-diff in step 4
picks up the subfolder automatically):

```bash
# 1b. Aljeel-only: pull the isolated Asateel prefix into a subfolder of the
# same KB dir so the AP agent indexes it alongside Jawal.
if [ "$BUCKET" = "accord-aljeel-ap-kb" ]; then
  mkdir -p "$CURRENT/asateel"
  sudo -u clawdbot rclone copy "spaces:${BUCKET}/asateel/current/" "$CURRENT/asateel/" \
    --transfers 4 --update --stats-one-line --stats 30s 2>&1 | tail -3 \
    || log "asateel rclone copy failed (continuing)"
fi
```

Alternative (fully separate): a second kb-sync instance pulling the new prefix
into its own `/mnt/<vol>/<tenant>/` tree with its own index root.

---

## 9. API endpoints (Worker)

All under `/api`, all require a valid CF Access session (email from JWT) and pass
`gateTenant(tenant, email)`:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/files?tenant=<t>` | GET | list files in tenant prefix (merges Spaces listing + KV archive flags) |
| `/api/upload-url` | POST | `{tenant,key,size}` → presigned Spaces PUT url |
| `/api/download-url?tenant=&key=` | GET | presigned Spaces GET url (600s) |
| `/api/archive` | POST | `{tenant,key}` → set archived flag in KV |
| `/api/restore` | POST | `{tenant,key}` → clear archived flag |
| `/api/archive-folder` `/api/restore-folder` | POST | bulk by folder prefix |
| `/api/events?tenant=<t>` | GET | 30-day audit log |

KV schema: `archived:<tenant>:<path>` = `{at,by}`; `event:<tenant>:<id>` =
`{kind,key,by,at}` (30-day TTL).

---

## 10. Gotchas (learned the hard way)

- **Spaces CORS is mandatory** — without a PUT CORS rule, browser uploads 403 on
  preflight. Symptom looked like an auth bug; it's CORS. (May 21 2026.)
- **The Worker keys files by `<prefix>`** — when sharing a bucket across tenants,
  EVERY `current/` literal must become `cfg.prefix` or tenants leak into each
  other. (Jun 30 2026 Asateel split.)
- **`kb-sync.sh` only pulls what you tell it** — a new prefix won't sync to the
  droplet until you add an rclone line for it. The portal tab can be live while
  the agent still can't see the files. (Jun 30 2026.)
- **`bash -n` passes but runtime can still log a transient error** during a
  mid-edit write while the timer fires concurrently — re-run and confirm a clean
  pass with exit 0 before trusting it.
- **Pages deploy account matters** — `regent-files` is on the MAIN account
  (`5157425b…`), not the fleet or AI-gateway accounts. Use the `cfut_…` token.

---

## 11. Live state (as of 2026-06-30)

- **Portal:** https://files-aljeel.accordpartners.ai — tabs **Al Jawal** +
  **Asateel**, Accord navy skin, OTP-gated.
- **Bucket:** `accord-aljeel-ap-kb` (sfo3). Jawal `current/`, Asateel
  `asateel/current/`.
- **Droplet:** `206.189.57.22`, volume `/mnt/aljeel_ap_kb`, sync wired for both
  prefixes (Asateel mingled into `current/asateel/`).
- **Source of truth for this codebase:** this directory in the `amrshady/aljeel`
  repo. Also deployed-from on Malik (`~/clawd/projects/regent-files`) and mirrored
  on the AP droplet (`~/.openclaw/workspace/aljeel/files-portal`).
