I've read all the relevant code: `scripts/droplet_api_flask.py` (the full pipeline worker), `dashboard/public/_worker.js`, `dashboard/wrangler.toml`, `portal.html`'s run/download logic, the systemd unit, and the actual log + file timestamps from the latest real run (b2c0b241, J26-870, this morning). Here are the answers.

---

## Question 1: Deployment checklist

First, the architecture facts the checklist follows from:

- **Flask** runs as systemd unit `aljeel-flask.service` (`ExecStart=/usr/bin/python3 scripts/droplet_api_flask.py`, `Restart=always`). It loads code **once at startup** — `app.run()` has no reloader, so code edits do nothing until a restart. It also reads `~/.openclaw/.env` once at startup (`droplet_api_flask.py:31-36`), so token/key changes need a restart too.
- **Pipeline stage scripts** (`process_batch.py`, `run_v30.py`, `ai_fraud_detector.py`, `inject_fraud_to_excel.py`, `build_j788_review_v30.py`, `split_multi_emp.py`, `seed_audit_db.py`, `export_audit_json.py`, `qa_agent.py`) are launched as **fresh subprocesses per run** — edits to those take effect on the next run *without* a Flask restart. Exceptions imported into the Flask process itself (restart needed): `msg_parser` (line 28), plus `discover` and `preflight_scan`, which are imported lazily inside handlers but cached in `sys.modules` after first use.
- **Pipeline runs are daemon threads inside the Flask process** (`/process`, line 1034-1039). Restarting Flask kills any in-flight run dead and leaves `run.lock` behind; the stale-lock cleaner only fires after the lock is 10 minutes old (line 114), and `/clear-lock` refuses while the log is <30s old.
- **The portal and all downloads are served by Cloudflare Pages** (project `aljeel-ap-finance`, per `wrangler.toml`). `_worker.js` proxies `/api/*` and `/evidence/*` to Flask over the tunnel, but **everything else — including `/outputs/*.xlsx` — falls through to `env.ASSETS`**, i.e. the static Pages deployment snapshot. A file in `dashboard/public/outputs/` on the droplet is invisible to the portal until the next `wrangler pages deploy`.

### The checklist

1. **Check no pipeline run is in flight** — `curl localhost:5000/current-run` (or check `run.lock`).
   *Skip it:* a Flask restart silently kills the run mid-flight; the orphaned lock then blocks all new runs for up to 10 minutes, and the user sees a run that "hangs" forever.

2. **Land the code changes on the droplet** (workspace is not a git repo — files are edited in place; convention is to note changes in `change-log.md`).

3. **Restart Flask if — and only if — `droplet_api_flask.py`, `msg_parser.py`, `discover.py`, `preflight_scan.py`, or `.env` changed:** `sudo systemctl restart aljeel-flask`.
   *Skip it:* Flask serves the old code indefinitely (no auto-reload; systemd only restarts on crash). *Do it out of order (during a run):* see step 1.
   Note: stage-script-only changes do **not** need this — next run picks them up.

4. **Verify Flask is healthy:** `systemctl status aljeel-flask` and `curl localhost:5000/ping`.
   *Skip it:* every portal API call returns 502 "Droplet unreachable" via the worker, and you won't know whether it's the tunnel or Flask.

5. **If anything in `dashboard/public/` changed (`portal.html`, `_worker.js`, `evidence.html`, data JSONs):** first make sure `public/data/audit_runs.db` is absent (a file >25MB makes the whole Pages deploy fail — the pipeline deletes it at line 727-728 for exactly this reason), then `cd dashboard && npx wrangler pages deploy public/`.
   *Skip it:* Cloudflare keeps serving the old portal/worker forever — and worse, the **next pipeline run auto-deploys the entire `public/` directory at its end** (line 732), so half-finished local edits ship to production at an arbitrary later moment. Either deploy your edits deliberately or don't leave unfinished edits in `public/`.

6. **Hard-reload the portal in the browser.** The open tab is HTML from the previous deploy; nothing in `portal.html` version-checks or self-refreshes.
   *Skip it:* the user exercises old front-end logic against new backend behavior.

7. **Run the pipeline (if fresh data is needed).** The run itself writes outputs to `batches/jawal-{id}/output/`, copies them to `dashboard/public/outputs/` (lines 703-720), rebuilds the audit JSON, and **runs the wrangler deploy as its own final step** (lines 730-742).
   *Ordering note:* a manual wrangler deploy *before* the run finishes ships old outputs (harmless — the run's final deploy supersedes it). A Flask restart *after* starting the run kills it (step 1).

One structural caveat outside this loop: `_worker.js`'s `/api/audit` and `/files/*` routes fetch from `https://aljeel-ap-files.pages.dev` — a **different Pages project** that the pipeline's deploy (project `aljeel-ap-finance`) never updates. Anything served via that mirror stays stale until that project is deployed separately; nothing in this repo deploys it.

---

## Question 2: Will the stale-data window happen again?

**Short answer: the happy path is closed, but the failure path is wide open — and it presents stale data as success.**

**1. Is there a gap between disk write and Cloudflare serving it?**
Yes, two distinct ones:

- **Happy-path gap (hidden from the user):** outputs land in `dashboard/public/outputs/` at the end of Stage 5, but Cloudflare serves them only after `seed_audit_db.py` + `export_audit_json.py` + the wrangler deploy complete. However, the portal hides the success panel when a run starts (`panelSuccess.style.display = 'none'`, portal.html:1023) and shows the download button **only** on the `[END]` SSE message — and `[END]` is logged *after* the deploy command exits (worker lines 730-746). So through the button, the user can't hit this gap.
- **Failure-path gap (the real problem, still live):** `[END]` is written in a `finally` block (line 746), so **every** failure path — Stage 1-5 failure, worker crash, *and explicitly a failed wrangler deploy* (line 738-740 logs "Deploy failed" and returns) — also emits `[END]`. The portal's `handleStreamMessage` (line 1448) treats any `[END]` except the lock-conflict case as success: `completeRun()` (line 1421) shows "✅ AP Agent Pipeline Run Completed Successfully!" and the download button **unconditionally**. The button points at `/outputs/Spreadsheet-{batch}-FILLED-v30.xlsx` on Pages — which still holds the *previous* deploy's file. The user downloads stale data with a green checkmark telling them it's fresh.

**2. How long is the gap?**
From the latest real run (b2c0b241, J26-870): final xlsx written 06:02:24, `audit-export.json` finished 06:04:41, wrangler deploy completed and `[END]` written 06:04:53. So **disk-write → Cloudflare-serving ≈ 2.5 minutes**, dominated by the audit DB seed/export; the wrangler step itself was ~12 seconds (log shows "Uploaded 5 files (0.88 sec)" plus worker bundle compile/deploy). After wrangler prints "Deployment complete" the production alias is switched; edge propagation is typically a few more seconds, but nothing in the code measures or guarantees it. In the failure path, the gap is **unbounded** — stale until someone notices and re-runs.

**3. Does anything tell the browser to wait for the deploy?**
Only implicitly: the deploy runs synchronously inside the worker before `[END]`, and the button gates on `[END]`. That's the entire mechanism. There is no success/failure discrimination in the `[END]` signal, no polling of the Cloudflare Deployments API, no fetch-back verification of the deployed asset, and no version stamp. The log line "Deploy complete! Refreshing UI in 3 seconds..." (line 742) is cosmetic — no code on either side implements a delay or refresh. The split-output button is even weaker: `updateSplitDownloadButton` (portal.html:1402) asks Flask `/api/files/{batch}` whether the file exists **on the droplet's disk**, then points the link at the **Pages** asset — disk existence and deployed existence are different things, so it can show a button whose target is stale or 404.

**4. User runs pipeline and immediately clicks download — what do they get?**
While the run is in progress the success panel is hidden, so the fresh button isn't clickable. But the URL `/outputs/Spreadsheet-{batch}-FILLED-v30.xlsx` is always live (an old tab, the hardcoded href at line 368, or `loadOursFile` at line 494 fetching it for comparison): it returns **the file from the last successful deploy — the previous run's output — as a silent HTTP 200**, indistinguishable from fresh data. And if the current run fails at any stage, the button appears anyway and serves exactly that stale file under a success banner.

**5. What would close it?** In order of effort:

1. **Distinguish success from failure (smallest fix, biggest win):** have the worker log `[PIPELINE_SUCCESS]` only after a zero-exit deploy, and have `completeRun()` show the download button only when that marker was seen — otherwise show an error state. ~10 lines across `droplet_api_flask.py` and `portal.html`. This alone kills the worst behavior (stale data labeled as success).
2. **Verify the deploy actually serves the new bytes:** before deploying, write a `public/outputs/manifest.json` containing `{batch, run_id, sha256}`; after `[END]`, the portal polls `/outputs/manifest.json` (with `cache: 'no-store'`) until `run_id` matches the current run, then enables the button. This closes deploy failure *and* edge propagation in one mechanism, with no Cloudflare API credentials in the browser.
3. **Poll the Cloudflare Pages Deployments API** from the worker after wrangler exits (`GET /accounts/{account_id}/pages/projects/aljeel-ap-finance/deployments`, wait for `latest.status == "success"`). Works, but adds an API-token dependency and still doesn't prove the specific asset is the new one — option 2 is strictly better.
4. **Structural fix — stop serving downloads from Pages at all:** add a Flask route (`/download/<batch>/<kind>` using `send_file` from `batches/jawal-{id}/output/`), proxy it through `_worker.js` like the existing `/evidence/*` routes, and point the download buttons at `/api/download/...`. The tunnel and proxy infrastructure already exist; downloads then reflect disk state the instant Stage 5 finishes, and the wrangler deploy only matters for HTML/JSON. This eliminates the gap category entirely rather than patching it.

If you want one recommendation: do 1 immediately (it's the live bug), and 4 as the durable fix — it removes the deploy from the download path instead of synchronizing with it.
