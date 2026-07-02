Read-only audit completed. I did not edit files or clear caches.

**A. Portal Call Chain**

The `/portal` UI is the static `dashboard/public/portal.html` page. The main run button reads the selected hardcoded batch id, reads the “Force Fresh LLM” checkbox, then opens an SSE stream:

`portal.html -> EventSource('/api/process?batch_id=...&no_cache=...')` at [portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:784).

Cloudflare Pages Worker handles `/api/process` in [\_worker.js](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/_worker.js:160). It looks up `DROPLET_URL` from KV, rewrites the path to `/process`, forwards the query string, and streams the droplet response body back to the browser. This is not a queue. It is a synchronous streamed HTTP request through Worker -> droplet -> subprocesses.

The droplet process is started by [start_api_daemon.sh](/home/clawdbot/.openclaw/workspace/aljeel/scripts/start_api_daemon.sh:2), which runs [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:24) on port 5000 and starts an SSH reverse tunnel. The tunnel manager updates Cloudflare KV `DROPLET_URL` with the localhost.run URL at [tunnel_manager.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/tunnel_manager.py:11).

The current portal-triggered pipeline is:

1. `GET /api/process?...` in Worker.
2. Worker forwards to `DROPLET_URL/process?...`.
3. Flask `/process` streams SSE while running subprocesses sequentially:
   - Stage 1: `scripts/process_batch.py --batch ... --raw-dir ... --suffix v15.11.2` at [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:34).
   - Stage 2: `scripts/run_v30.py <batch> --input-suffix v15.11.2 --no-cache` at [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:47).
   - Stage 3: `qc/ai-poc/ai_fraud_detector.py` with `AI_POC_BATCHES=<batch>` at [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:61).
   - Stage 4: `scripts/inject_fraud_to_excel.py <batch>` at [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:75).
   - Audit DB seed/export at [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:86).
   - Copy XLSX to `dashboard/public/outputs/Spreadsheet-<batch>-FILLED-v30.xlsx` at [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:96).
   - `npx wrangler pages deploy public/` at [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:103).

Outputs produced/served:

- Stage 1 writes `batches/jawal-<batch>/output/Spreadsheet-<batch>-FILLED-v15.11.2.xlsx`.
- Stage 2 writes `Spreadsheet-<batch>-FILLED-v30.xlsx`, `step-trace-v30.jsonl`, `summary-v30.json`, fraud/booking JSON, and score files in the batch output dir.
- Stage 4 mutates/injects fraud into the v30 XLSX.
- Portal download reads `/outputs/Spreadsheet-<batch>-FILLED-v30.xlsx`.
- Audit modal calls `/api/audit?ticket=...` at [portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:1215). Worker fetches static `audit-export.json` from `https://aljeel-ap-files.pages.dev/data/audit-export.json`, not from the local Pages assets, at [\_worker.js](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/_worker.js:147).

Important bypass: the portal path does not call `scripts/discover.py`. It hardcodes batch directories and suffixes. The older canonical `scripts/run_all.sh` does call discovery at [run_all.sh](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_all.sh:28), but the portal droplet route bypasses that whole path.

**B. Caching Behavior And Saleh Basiri Root Cause**

The portal does not run a true zero-cache pipeline.

The checkbox says “Force Fresh LLM (No Cache)” at [portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:297), but the droplet route ignores the checkbox for stage 1 and always forces stage 2 with `--no-cache`. In [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:953), `no_cache = True` is hardcoded regardless of CLI flags. That disables v16 classify/resolve cache reads in [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:438) and [run_v16.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v16.py:625), and cache writes there are commented out.

But stage 1 still uses persistent caches:

- `extracted/msg-cache`: `parse_msg(..., use_cache=True)` in stage 1, with file SHA keys at [msg_parser.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/msg_parser.py:152).
- `extracted/allocation-llm-cache`: prompt SHA cache in [allocation_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/allocation_resolver.py:231).
- `extracted/allocation-llm-email-cache`: msg SHA cache in [email_allocation_extractor.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/email_allocation_extractor.py:327).
- `extracted/location-llm-cache`: email/city/venue caches in [location_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/location_resolver.py:282) and [location_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/location_resolver.py:497).
- `extracted/opex-pdf-cache`: PDF SHA cache in [opex_pdf_parser.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/opex_pdf_parser.py:97).
- `cache/passenger_to_empno.json`: cross-batch passenger cache used by employee resolver L8 at [employee_resolver_v2.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1026).
- `cache/email_to_empno.json`: learned email cache used at [email_resolver.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/email_resolver.py:207).
- `qc/ai-poc/cache`: AI fraud detector payload cache at [ai_fraud_detector.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/ai-poc/ai_fraud_detector.py:1207).

Current extracted cache counts: `msg-cache` has 359 files, `opex-pdf-cache` 8, allocation caches 4 each, location backup 8. `extracted/v16-cache` and `extracted/full-evidence-agent-cache` are currently empty, but the code still contains those mechanisms.

Saleh Basiri root cause:

- Current stage 1 output still has the stale value:
  - `batches/jawal-J26-788/output/Spreadsheet-J26-788-FILLED-v15.11.2.xlsx`, Excel row 8 / df index 4: `ALBASIRI/SALEH MR`, `Employee No = 1000074`.
- The bad cache entry is explicit:
  - [passenger_to_empno.json](/home/clawdbot/.openclaw/workspace/aljeel/cache/passenger_to_empno.json:77): `"SALEH ALBASIRI": 1000074`.
- `process_batch.py` tries to clear only the raw L0 employee number for this one row at [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:668), but then calls `resolve_employee(...)` at [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:675). `resolve_employee` later reaches L8 cross-batch cache at [employee_resolver_v2.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/employee_resolver_v2.py:1452), finds `"SALEH ALBASIRI" -> 1000074`, and returns it.
- There is a guard preventing future enrichment of sponsorship rows into passenger cache at [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:815), but it does not invalidate existing poisoned entries. Therefore reruns keep reusing the bad mapping in stage 1.
- Stage 2 `run_v30.py` then blanks sponsorship emp numbers and routes/reprocesses Saleh. Current v30 XLSX has `Employee No = blank`, not `1000074`, but current v30 also regressed account to `60301003` while keeping event CC/div/agency. Static `j788-rows-v30.json` is older and says `60307021`, so portal surfaces inconsistent results depending on which view/file is used.

Does the portal serve stale results? Yes, in at least two ways:

- `dashboard/public/data/j788-rows-v30.json` is stale: mtime `2026-06-06 06:17:58`, while current v30 XLSX is `2026-06-08 02:01:13`. The script that rebuilds this JSON is [build_j788_review_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/build_j788_review_v30.py:481), but the portal droplet route never calls it.
- `audit-export.json` is regenerated, but `seed_audit_db.py` inserts every historical `step-trace-*.jsonl` from every batch/version at [seed_audit_db.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/seed_audit_db.py:34), without filtering current batch/version or clearing old rows first. The audit modal can return multiple contradictory records for the same ticket.

**C. Prioritized Defect List**

1. **Critical: “No cache” is misleading and incomplete.**
   The portal only forces `run_v30` LLM calls fresh. Stage 1 still uses message, employee, email, allocation, location, OPEX, and cross-batch caches. This directly explains Saleh Basiri staleness.

2. **Critical: poisoned `passenger_to_empno.json` survives reruns.**
   `"SALEH ALBASIRI": 1000074` persists and L8 reads it. The one-off L0 clearing hack does not bypass L8.

3. **Critical: portal bypasses discovery and canonical run orchestration.**
   It hardcodes `batches/jawal-<batch>`, `raw`, `v15.11.2`, `v30`, and script paths in [droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:34). `discover.py` exists specifically to avoid this.

4. **High: stale UI data builders are not in the portal chain.**
   `build_j788_review_v30.py` generates the review JSON, but `/process` does not call it. Downloaded XLSX and review JSON can disagree.

5. **High: audit export is append-all-history, not current-run scoped.**
   `seed_audit_db.py` reads all historical traces and inserts into DB. `export_audit_json.py` exports all rows without filtering at [export_audit_json.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/export_audit_json.py:11).

6. **High: no job queue, lock, or run isolation.**
   Flask is threaded, `/process` streams a long synchronous run, and concurrent portal clicks can overwrite shared outputs/caches. There is no run id, workspace, or lock.

7. **High: blind overwrites and shared mutable outputs.**
   Portal copies final XLSX directly to static `dashboard/public/outputs/...v30.xlsx`, exports JSON in place, removes `audit_runs.db`, and deploys `public/`. `run_v30.py` backs up old XLSX but still writes canonical filenames.

8. **Medium: line-item-specific hacks.**
   Saleh-specific route forcing in [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:898) and Saleh-specific L0 clearing in [process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:668) are not general solutions.

9. **Medium: version stacking and misleading comments.**
   `run_v30.py` imports v16/v17/v24/v15 helpers, comments refer to v25/v26/v27, and outputs say “v25 pass complete” in a v30 script at [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1349).

10. **Medium: hardcoded J26-788/J26-640 assumptions.**
   `build_j788_review_v30.py` is fixed to J26-788. `run_v30.py` uses J26-640 lookup fallback/reference paths at [run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1371).

**Proposed Rewrite Plan**

1. Create one portal runner entrypoint, e.g. `ap_pipeline run --batch J26-788 --run-id <uuid> --cache-policy fresh|read-through|offline`, and make the Worker call only that.
2. Replace hardcoded paths with a batch manifest produced by `discover.py`: invoice file, raw dirs, gdrive evidence dirs, output dirs, expected builders.
3. Implement a cache registry with namespaces, keys, provenance, and invalidation. “Fresh” must disable or isolate all caches, including `cache/passenger_to_empno.json`, not just LLM row caches.
4. Remove passenger-to-employee learned cache from authoritative resolution unless entries include source evidence, confidence, batch provenance, and validation against current row/evidence. Treat it as a suggestion, not a resolver layer.
5. Run every portal execution in a run-specific output directory. Publish to `dashboard/public` only after validation passes, using atomic promotion.
6. Make dashboard JSON/XLSX/audit export all derive from the same promoted run artifact. No separate stale builders.
7. Replace line-specific hacks with general rules: external sponsorship detection, event-folder matching, OPEX requester extraction, and employee/dependent validation.
8. Add a run lock or queue. Return a run id immediately, stream logs by run id, and prevent concurrent writes to shared artifacts.
9. Add regression tests around known cases: Saleh Albasiri, Farah/Ekrema Saleh, family PC rows, OPEX sponsorship rows, and J26-640/J26-788 cross-batch contamination.
10. Keep old versioned scripts as archived baselines; make the portal use one maintained pipeline module with explicit stages and contracts.
