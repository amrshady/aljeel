Fixed all 7 audit issues. No deploy was run.

Validation passed:
```bash
python3 -m py_compile /home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py
python3 -m py_compile /home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py
```

Extra syntax checks also passed for `_worker.js` and the extracted portal script.

```diff
--- scripts/droplet_api_flask.py.orig
+++ scripts/droplet_api_flask.py
@@ -28,6 +28,7 @@
             os.environ[_k.strip()] = _v.strip()
 
 app = Flask(__name__)
+app.config['MAX_CONTENT_LENGTH'] = 32 * 1024 * 1024
 CORS(app)
 
 def _atomic_copy(src, dst):
@@ -53,6 +54,13 @@
             since = None
     return {"locked": True, "since": since}
 
+def _is_under_uploads_dir(path):
+    try:
+        Path(path).resolve().relative_to(UPLOADS_DIR.resolve())
+        return True
+    except (OSError, ValueError):
+        return False
+
 def _resolve_jawal_batch_paths(batch_id):
@@ -78,7 +86,7 @@
-                return batch_dir, raw_root, None
+                return batch_dir, raw_root, None, None
@@ -98,13 +106,13 @@
-            return batch_dir, raw_dir, None
+            return batch_dir, raw_dir, invoice_candidates[0], None
@@
-            return batch_dir, raw_dir, None
+            return batch_dir, raw_dir, None, None
 
-    return None, None, f"No valid batch layout found for {normalized} (checked archive/raw-{normalized} and {batch_dir})"
+    return None, None, None, f"No valid batch layout found for {normalized} (checked archive/raw-{normalized} and {batch_dir})"
@@ -125,10 +133,14 @@
     f = request.files['file']
     if not f.filename:
         return jsonify({"error": "Empty filename"}), 400
+    safe_name = secure_filename(f.filename)
+    if not safe_name:
+        return jsonify({"error": "Invalid filename"}), 400
+    if Path(safe_name).suffix.lower() not in (".xlsx", ".xls"):
+        return jsonify({"error": "Only Excel files accepted"}), 400
     upload_id = uuid.uuid4().hex[:12]
     dest_dir = UPLOADS_DIR / upload_id
     dest_dir.mkdir(parents=True, exist_ok=True)
-    safe_name = secure_filename(f.filename)
@@ -163,7 +175,7 @@
-            batch_dir, raw_dir, discover_error = _resolve_jawal_batch_paths(batch_id)
+            batch_dir, raw_dir, discovered_invoice, discover_error = _resolve_jawal_batch_paths(batch_id)
@@ -172,9 +184,24 @@
-            if invoice_path and Path(invoice_path).exists():
-                cmd1 += ["--invoice-file", invoice_path]
-                yield sse(f"[API] Using uploaded invoice: {Path(invoice_path).name}")
+            if invoice_path:
+                try:
+                    resolved_invoice_path = Path(invoice_path).resolve()
+                except OSError as e:
+                    print(f"[warn] Invalid invoice_path {invoice_path}: {e}", flush=True)
+                    yield sse(f"[API] ERROR: Invalid invoice_path: {invoice_path}")
+                    yield "data: [END]\n\n"
+                    return
+                if not resolved_invoice_path.exists() or not _is_under_uploads_dir(resolved_invoice_path):
+                    print(f"[warn] Rejected invoice_path outside uploads or missing: {invoice_path}", flush=True)
+                    yield sse(f"[API] ERROR: Invalid invoice_path: {invoice_path}")
+                    yield "data: [END]\n\n"
+                    return
+                cmd1 += ["--invoice-file", str(resolved_invoice_path)]
+                yield sse(f"[API] Using uploaded invoice: {resolved_invoice_path.name}")
+            elif discovered_invoice is not None:
+                cmd1 += ["--invoice-file", str(discovered_invoice)]
+                yield sse(f"[API] Using discovered invoice: {discovered_invoice.name}")
```

```diff
--- scripts/process_batch.py.orig
+++ scripts/process_batch.py
@@ -422,11 +422,11 @@
     result = {}
-    if invoice_file:
+    explicit_invoice_file = invoice_file is not None
+    if explicit_invoice_file:
         invoice_xlsx = Path(invoice_file)
         if not invoice_xlsx.exists():
-            print(f"[v15.10] Warning: --invoice-file {invoice_xlsx} not found", flush=True)
-            return result
+            raise RuntimeError(f"--invoice-file {invoice_xlsx} not found")
@@ -444,7 +444,9 @@
-        except Exception:
+        except Exception as fallback_e:
+            if explicit_invoice_file:
+                raise RuntimeError(f"could not read Details sheet from explicit --invoice-file {invoice_xlsx}") from fallback_e
             print(f"[v15.10] Warning: could not read Details sheet from {invoice_xlsx.name}: {e}", flush=True)
```

```diff
--- dashboard/public/portal.html.orig
+++ dashboard/public/portal.html
@@ -781,7 +781,7 @@
-    document.getElementById('btn-run').addEventListener('click', () => {
+    document.getElementById('btn-run').addEventListener('click', async () => {
```

```diff
--- dashboard/public/_worker.js.orig
+++ dashboard/public/_worker.js
@@ -157,6 +157,36 @@
     }
 
+    if (url.pathname === '/api/upload') {
+      if (request.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
+
+      try {
+        const targetStr = await env.ACTIONS_KV.get('DROPLET_URL');
+        if (!targetStr) return jsonResponse({ ok: false, error: 'DROPLET_URL not set in KV' }, 500);
+
+        const targetUrl = new URL(targetStr);
+        targetUrl.pathname = '/upload';
+        targetUrl.search = '';
+
+        const response = await fetch(targetUrl.toString(), {
+          method: 'POST',
+          headers: request.headers,
+          body: request.body
+        });
+
+        const responseHeaders = new Headers(response.headers);
+        responseHeaders.set('Cache-Control', 'no-store');
+        responseHeaders.set('Access-Control-Allow-Origin', '*');
+
+        return new Response(response.body, {
+          status: response.status,
+          headers: responseHeaders
+        });
+      } catch (err) {
+        return jsonResponse({ ok: false, error: err.message }, 500);
+      }
+    }
+
     if (url.pathname === '/api/process') {
```
