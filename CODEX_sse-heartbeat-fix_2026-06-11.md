Implemented in [scripts/droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:134). I did not restart Flask.

Confirmed `/process` uses `_stream_run_log(...)` directly at [scripts/droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:1076), so there was no separate `/process` generator to patch.

Portal audit was read-only:
- Main pipeline uses `EventSource.onmessage` at [portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:1574), so SSE comment lines are not dispatched as message events.
- The manual QA SSE parser filters only `data:` lines and skips events with none at [portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:1371), so comments are ignored there too.

Exact diff:

```diff
--- scripts/droplet_api_flask.py
+++ scripts/droplet_api_flask.py
@@
 def _stream_run_log(run_id, log_path):
     def sse(message):
         return f"data: [RUN-{run_id}] {message}\n\n"
 
     with log_path.open("r", encoding="utf-8") as log_handle:
+        last_yield_time = time.monotonic()
         while True:
             line = log_handle.readline()
             if not line:
+                now = time.monotonic()
+                if now - last_yield_time > 30:
+                    yield ": heartbeat\n\n"
+                    last_yield_time = now
                 time.sleep(0.5)
                 continue
 
             message = line.rstrip("\n")
+            last_yield_time = time.monotonic()
             if message == "[END]":
                 yield "data: [END]\n\n"
                 return
```

Verification: `python3 -m py_compile scripts/droplet_api_flask.py` passed.
