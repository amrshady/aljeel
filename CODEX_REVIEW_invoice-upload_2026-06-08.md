**Findings**

1. **Must fix: portal JS currently has a syntax error and will not run.**  
   [portal.html:784](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:784) registers `addEventListener('click', () => { ... })`, but [portal.html:818](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:818) uses `await fetch(...)` inside that non-`async` function. `node --check` fails with: `SyntaxError: await is only valid in async functions`. This breaks the whole inline script, not just upload.

2. **Must fix: `/api/upload` is not proxied by the current Cloudflare worker.**  
   The portal posts to `/api/upload` at [portal.html:818](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:818), but `dashboard/public/_worker.js` only proxies `/api/process` to Flask. The new Flask route is `/upload` at [droplet_api_flask.py:117](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:117). Unless another proxy handles it, uploads will 404/fall through to static assets in production.

3. **Must fix/security: `invoice_path` accepts arbitrary server paths.**  
   [droplet_api_flask.py:141](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:141) takes `invoice_path` directly from the query string, and [droplet_api_flask.py:175](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:175) only checks `Path(invoice_path).exists()` before passing it to `process_batch.py`. This bypasses the upload directory entirely. It is not shell injection because `subprocess.Popen` uses an argv list, but it is still an arbitrary server-file read/parse primitive and a path-existence probe. It should require the resolved path to be under `UPLOADS_DIR`, with an expected extension.

4. **Must fix/security: upload endpoint lacks size/type/auth hardening.**  
   [droplet_api_flask.py:117](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:117) accepts any multipart file and saves it permanently under [droplet_api_flask.py:129](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:129). There is no `MAX_CONTENT_LENGTH`, no `.xlsx` validation, no content sanity check, and no cleanup. `secure_filename` prevents simple path traversal in the filename, but `secure_filename("../../../")` becomes `""`, so [droplet_api_flask.py:132](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:132) can become the upload directory itself and produce a 500 on save.

5. **Logic regression: live-layout invoice discovery does not actually pass the discovered invoice to Stage 1.**  
   `_resolve_jawal_batch_paths()` scans for invoice candidates at [droplet_api_flask.py:93](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:93), but returns only `(batch_dir, raw_dir, None)` at [droplet_api_flask.py:101](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:101). Stage 1 only gets `--invoice-file` if the portal provided `invoice_path` at [droplet_api_flask.py:175](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:175). Meanwhile `_load_voucher_empno_map()` only auto-detects filenames matching `J\d+-\d+\.xlsx` at [process_batch.py:435](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:435). The current live J26-788 invoice is named `INV-01-07 MAY 26 AL JEEL.xlsx`, so on-disk fallback will not load voucher emp_no mappings unless the upload path works.

6. **Missing error handling: invalid provided `invoice_path` silently falls back.**  
   If `invoice_path` is supplied but missing, outside policy, unreadable, or malformed, [droplet_api_flask.py:178](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:178) reports “No uploaded invoice provided” and continues with on-disk invoice. That can hide a failed upload and produce different audit output than the reviewer intended.

7. **Missing error handling: explicit bad invoice file degrades silently.**  
   `_load_voucher_empno_map()` catches read failures and returns `{}` at [process_batch.py:441](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:441). For an explicit `--invoice-file`, that should probably be a hard failure, because the caller explicitly requested that invoice. The portal accepts `.csv` at [portal.html:220](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:220), but the backend expects an Excel workbook with `Details` or sheet index `1`.

**Verification**

Backend syntax passes: `python3 -m py_compile scripts/process_batch.py scripts/droplet_api_flask.py`.

Frontend syntax fails: `node --check` on the inline script reports the `await` syntax error above.

**Verdict**

Not safe to leave as-is. The immediate blockers are the non-async click handler, missing `/api/upload` proxy, and unrestricted `invoice_path`. After those, tighten upload validation/limits and make explicit invoice failures fail loudly instead of silently changing pipeline behavior.
