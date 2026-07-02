All three tasks complete. `python3 -m py_compile` passes on both changed files; nothing was deployed or restarted.

## Tasks 1 & 2 — fixes applied

**Task 1** — `scripts/droplet_api_flask.py` (Stage 2.5 failure handling):

```diff
                     stage25_code = _run_logged_command(cmd25, log_handle)
                     if stage25_code != 0:
+                        if parsed_json.exists():
+                            log("[API] Stage 2.5 failed and stale parsed data exists — aborting to prevent stale fraud audit")
+                            return
                         log(f"[API] WARNING: Stage 2.5 (Document Parser) failed with code {stage25_code}; Stage 3 may fail")
                     else:
                         log(f"[API] Stage 2.5 complete: {parsed_json.name} written")
```

If Stage 2.5 fails and no stale file exists, the warning path remains (Stage 3 then fails on the missing file and aborts, as before). **Note: the running Flask process (PID 2942877, started 06:05) still has the old code — this takes effect on the next Flask restart.** I did not restart it myself.

**Task 2** — `qc/ai-poc/ai_document_parser.py` (15s delay on 503 between model fallbacks):

```diff
-def _call_gemini_model(prompt_text: str, api_key: str, model: str) -> Optional[dict]:
+def _call_gemini_model(prompt_text: str, api_key: str, model: str) -> tuple[Optional[dict], bool]:
+    """Returns (response_json, is_unavailable). is_unavailable is True on HTTP 503/UNAVAILABLE."""
     ...
     try:
         with urllib.request.urlopen(req, timeout=180) as resp:
-            return json.loads(resp.read())
+            return json.loads(resp.read()), False
     except urllib.error.HTTPError as e:
         body = e.read().decode(errors="replace")[:300]
         print(f"    [gemini/{model}] HTTP {e.code}: {body}", file=sys.stderr)
-        return None
+        return None, (e.code == 503 or "UNAVAILABLE" in body)
     except Exception as e:
         print(f"    [gemini/{model}] Error: {e}", file=sys.stderr)
-        return None
+        return None, False
```
```diff
-    for model in _GEMINI_MODEL_CASCADE:
+    for idx, model in enumerate(_GEMINI_MODEL_CASCADE):
         print(f"  [ai_parser] Trying model: {model} ...", file=sys.stderr)
-        result = _call_gemini_model(prompt_text, api_key, model)
+        result, unavailable = _call_gemini_model(prompt_text, api_key, model)
         if result:
             ... (unchanged)
+        elif unavailable and idx < len(_GEMINI_MODEL_CASCADE) - 1:
+            print(f"  [ai_parser] Model {model} returned 503 — waiting 15s before trying next model...", file=sys.stderr)
+            time.sleep(15)
     return None, None
```

The sleep fires only on 503/UNAVAILABLE and only when another model remains in the cascade. Other errors (timeouts, 4xx, bad response shape) still fall through immediately. Also added a change-log.md entry per project convention.

## Task 3 — findings (no fixes applied)

**Answers to your five questions:**

1. **What gets deployed:** `npx wrangler pages deploy public/` with `cwd=dashboard` — only `dashboard/public/`, to project `aljeel-ap-finance`, and the deployment list confirms it lands on **Production/main** (not a preview).
2. **Copy vs deploy order:** the v30 XLSX is copied to `public/outputs/` **before** the deploy — twice, in fact: Stage 4.5's builder copies it (`build_j788_review_v30.py:523-525`), and the orchestrator copies it again after Stage 5 (`droplet_api_flask.py:700-708`), then promotes the review JSON, then deploys at line 729.
3. **SPLIT race:** **No race.** Stage 5 → copy SPLIT → deploy is strictly sequential in code, and the b2c0b241 log confirms the order: `[STAGE 5] Split complete` → `Copied SPLIT spreadsheet` → `Deploying...` → `Deployment complete`.
4. **build_j788_review_v30.py:** does **not** deploy — it writes the rows JSON, evidence files, and the duplicate XLSX copy only.
5. **Verdict: the pipeline's ordering is correct and its deploy worked.** The "stale portal" observation traces to a timeline misreading, detailed below.

**The corrected timeline (from disk evidence):** Run b2c0b241 actually started at **05:53:33 UTC**, not 06:01 — the log filename (`2026-06-10T055333...-b2c0b241.log`) embeds the `/process` request time. The portal's run-log stream replays the file from the beginning on reattach, so connecting at 06:01 makes a run that began at 05:53 *look* like it just started. The run wrote v30 at 06:02:24, the portal JSONs at 06:04:40, the SPLIT just after, and its wrangler deploy (`08650884…`, Production) finished with `[END]` at **06:04:53** — with all 5 fresh files included. Cloudflare serves these assets with `cache-control: max-age=0, must-revalidate`, so browser caching is ruled out too.

**What was actually stale:** anyone checking the portal between 06:02 (file on disk) and 06:04:53 (deploy live) was served the earlier *manual* deploy of the 05:51 test output — Cloudflare only updates when a deploy completes, ~2.5 minutes after the v30 file exists locally.

**Post-run anomaly worth knowing about:** the SPLIT files were regenerated at **06:09:12/06:09:17** (plain copy, not the pipeline's `_atomic_copy`) and a newer **manual** production deploy (`e9c25e74…`, ~06:08-09) is what production serves now — b2c0b241 was the last portal run today, so that deploy didn't come from the pipeline. Also, the current Flask process started at **06:05**, not 05:55 as in your timeline — had it actually restarted at 05:55 it would have killed the in-flight run, since runs are daemon threads inside the Flask process.

**Latent ordering gaps (reported, not fixed):** (a) if any stage after 4.5 fails, the run returns *without* deploying, but Stage 4.5 has already written fresh JSON/XLSX into `dashboard/public/` — so Flask's `/files` endpoint serves new data while Cloudflare serves old until the next successful deploy; (b) the copies at lines 703/706 are silently skipped if the source file is missing, with no warning before deploying; (c) `j26-788-review.html:897` fetches the rows JSON without `cache: 'no-store'`, unlike every other portal fetch — harmless today only because of the `must-revalidate` header.
