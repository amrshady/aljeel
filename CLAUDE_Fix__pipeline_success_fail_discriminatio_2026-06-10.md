Both fixes are done and verified. `py_compile` passes, `node --check` passes on `_worker.js` and the portal's inline script, and I functionally tested the new download route with Flask's test client (no server restart, no deploy). The workspace isn't a git repo, so below are the exact hunks rather than a `git diff`.

## Fix 1 — `[PIPELINE_SUCCESS]` vs `[END]`

**`scripts/droplet_api_flask.py`** — in `_run_pipeline_worker`:

```diff
         def log(message):
             _write_pipeline_log(log_handle, message)
+
+        pipeline_success = False
+        failure_reason = "unknown failure"
+
+        def fail(reason):
+            nonlocal failure_reason
+            failure_reason = reason
+            log(f"[API] {reason}")
```

Every failure path (13 sites) now records its reason via `fail(...)` instead of a bare `log(...)` — discover error, missing/non-Excel invoice, pre-stage conversion, Stages 1, 2, 2.5-stale-abort, 3, 4, 4.5, 5, deploy failure, and the crash handler. The log text the user sees is unchanged (`fail` re-adds the `[API] ` prefix).

```diff
                 if deploy_code != 0:
-                    log(f"[API] Deploy failed with code {deploy_code}")
+                    fail(f"Deploy failed with code {deploy_code}")
                     return
 
+                pipeline_success = True
                 log("[API] Deploy complete! Refreshing UI in 3 seconds...")
             except Exception as exc:
-                log(f"[API] ERROR: pipeline worker crashed: {exc}")
+                fail(f"ERROR: pipeline worker crashed: {exc}")
             finally:
+                if pipeline_success:
+                    log("[PIPELINE_SUCCESS]")
+                else:
+                    log(f"[PIPELINE_FAILED: {failure_reason}]")
                 log("[END]")
```

`pipeline_success` is set only after wrangler exits 0, per spec. No change to `_stream_run_log` was needed — the markers flow through the normal SSE path (prefixed `[RUN-xxxx]`, which is why the portal matches with `.includes()`), so the failure reason is also visible in the terminal log.

**`dashboard/public/portal.html`:**
- New state flags `pipelineSucceeded` and `finalLogReplayed`, both reset in `resetRunState()`.
- `handleStreamMessage` sets `pipelineSucceeded` at the very top — before the `[END]` check **and** before the replay-skip block, so reconnect replays still register success.
- `completeRun()` now branches: success → green panel, download buttons, `loadOursFile`; otherwise → `status.textContent = '❌ Pipeline failed — check the log above for details'`, success panel hidden, no `loadOursFile`. `clearRunState()`/`checkEnableRun()` run in both cases.
- **Edge case I fixed beyond the spec:** the reconnect path called `completeRun('Run completed while disconnected...')` when the lock was gone — with the new gating that would show "failed" for a run that actually succeeded while you were offline. It now replays the finished run's log (`/api/run-log?run_id=...`) once (guarded by `finalLogReplayed`) so the verdict comes from the real markers; it only falls back to the no-download completion when no `run_id` is known.

## Fix 2 — downloads served from Flask

**`scripts/droplet_api_flask.py`** — new route after `batch_files`:

```python
@app.route('/download/<batch_id>/<kind>', methods=['GET'])
@app.route('/api/download/<batch_id>/<kind>', methods=['GET'])
def download_output(batch_id, kind):
    batch_id = batch_id.strip().upper()
    if not re.match(r"^[A-Z0-9-]+$", batch_id):
        return jsonify({"error": "invalid batch id"}), 400
    # kind full → ...-FILLED-v30.xlsx, split → ...-FILLED-v30-SPLIT.xlsx, else 400
    file_path = ROOT / "batches" / f"jawal-{batch_id}" / "output" / name
    if not file_path.is_file():
        return jsonify({"error": "file not found"}), 404
    return send_file(file_path, as_attachment=True, download_name=name)
```

Both `/download/...` and `/api/download/...` are registered, matching the existing convention (`/files` vs `/api/files`).

**`dashboard/public/_worker.js`** — proxy block (plus a line in the route-table comment):

```js
if (p.startsWith('/api/download/')) {
  if (request.method !== 'GET') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  return proxyToDroplet(request, p.replace(/^\/api/, ''), url.search);
}
```

**`dashboard/public/portal.html`:**
- Full button: `dlBtn.href = API_BASE + '/api/download/${folderId}/full'` (static default href in the HTML updated too).
- Split button: `splitBtn.href = API_BASE + '/api/download/${folderId}/split'`; the `/api/files` existence check stays as-is.
- `loadOursFile()` (feeds the Ground Truth comparison) also read `/outputs/...` — same stale-asset bug — so I pointed it at the new endpoint as well. This was beyond your enumerated list; trivial to revert if you'd rather keep it on the static path.
- **Bug this surfaced:** `loadOursFile('J26-788')` runs at top level *before* `const API_BASE` was declared (~270 lines later), which would have thrown a TDZ ReferenceError and silently killed the startup preload. I moved the `API_BASE` declaration up above `loadOursFile`.

## Verification

- `python3 -m py_compile scripts/droplet_api_flask.py` — passes.
- `node --check` on `_worker.js` and the extracted portal inline script — passes.
- Flask test client (throwaway process, live server untouched): `J26-788/full` → 200, 52 KB, `attachment; filename=Spreadsheet-J26-788-FILLED-v30.xlsx`; `J26-870/split` → 200, 23 KB; lowercase batch id normalizes; bad kind → 400; missing file → 404; traversal attempts (`..%2F`, `.hidden`) → 404/400.

## Needs manual action

1. **Restart Flask** to pick up `droplet_api_flask.py` (note: this kills any in-flight pipeline run — the workers are daemon threads).
2. **`wrangler pages deploy`** for `_worker.js` + `portal.html`. Order matters slightly: restart Flask first, since the newly deployed portal points all downloads at the Flask route.
3. The old static copies under `dashboard/public/outputs/` are now unreferenced by the portal but still copied there by the pipeline each run (and still served as Pages assets). You may eventually want to stop copying them to shrink the deploy, but I left that untouched.
4. Runs that complete while the portal is fully closed (not just disconnected) and have no saved `run_id` will show the no-download completion message rather than a green panel — by design, since success can't be confirmed.
