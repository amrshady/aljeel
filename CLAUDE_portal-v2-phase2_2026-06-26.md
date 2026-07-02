# Portal v2 — Phase 2 (v2 API blueprint)

Codex run: `cx-20260626-045107-3592263` — done rc=0
Date: 2026-06-26 (UTC)

---

Implemented Phase 2 as a new Flask blueprint only: `scripts/droplet_api_v2.py`.

It adds:
`GET /v2/ping`, `GET /v2/batches`, `GET /v2/batches/<batch_id>/runs`, `POST /v2/batches/<batch_id>/runs`, `GET /v2/runs/<run_id>`, `GET /v2/runs/<run_id>/download`, `GET /v2/runs/<run_id>/log`, `POST /v2/runs/<run_id>/cancel`, and `POST /v2/maintenance/reap`.

It reuses `run_store.py`, `run_worker_v2.py`, v1 discovery helpers, v1 lock files, and the Cloudflare Access header `Cf-Access-Authenticated-User-Email`. Did not edit `scripts/droplet_api_flask.py` or any v1 route body.

## Registration Snippet

Place this near the bottom of `scripts/droplet_api_flask.py`, after the existing route/helper definitions and before:

```python
if __name__ == '__main__':
```

Add:

```python
from droplet_api_v2 import bp as portal_v2_bp
app.register_blueprint(portal_v2_bp)
```

## Verification

Ran a temporary local Flask harness on `127.0.0.1:5099` with the v2 blueprint registered. Used a deterministic detached worker stub for the HTTP lifecycle so the live droplet service and real pipeline were not restarted or disturbed. Temporary verification DB rows/artifacts were cleaned afterward.

Curl results:

```text
GET  /v2/ping                                      -> HTTP 200 {"ok":true}
GET  /v2/batches                                   -> HTTP 200 batch_count=11
POST /v2/batches/J26-788/runs                      -> HTTP 202 run_id=J26-788-20260626T045618Z-ae2bce
POST /v2/batches/J26-788/runs while lock held      -> HTTP 409 {"error":"run_in_progress",...}
GET  /v2/runs/<run_id> while client reconnected    -> HTTP 200 state=RUNNING
GET  /v2/runs/<run_id> after detached wait         -> HTTP 200 state=SUCCEEDED, split present
GET  /v2/runs/<run_id>/log?offset=0                -> HTTP 200 next_offset=33 eof=true
GET  /v2/runs/<run_id>/download                    -> HTTP 200 Content-Disposition SPLIT filename, 20 bytes
POST /v2/runs/<fresh_run_id>/cancel                -> HTTP 200 state=CANCELLED
GET  /v2/runs/<cancelled_id>                       -> HTTP 200 state=CANCELLED
GET  /v2/batches/J26-788/runs?limit=2              -> HTTP 200 newest-first history
POST /v2/maintenance/reap                          -> HTTP 200 {"reaped":[]}
```

Checks:
`python3 -m py_compile scripts/droplet_api_v2.py scripts/run_store.py scripts/run_worker_v2.py` passed. `pytest` could not be run because `pytest` is not installed in this environment. The shared lock files were clear after verification.

[status: done rc=0]
