# Asateel Reconciliation Trigger API — Agent Integration Guide

**Audience:** an AI agent or backend function that needs to trigger the AlJeel Asateel
reconciliation pipeline and report the outcome. Internal use only.

**Machine-readable spec:** [`asateel-trigger-api.openapi.yaml`](./asateel-trigger-api.openapi.yaml) (OpenAPI 3.1).
Load that spec for exact schemas; this file is the quick operational playbook.

---

## 1. What this API does

It runs the **Asateel** transportation / JQ-allocation reconciliation as an async job:
- `POST /asateel/run` → enqueues a job, returns `run_id` (HTTP 202).
- A single background worker runs one job at a time (FIFO): stage from archive → run
  allocation engine → golden gate → produce `*_Oracle-upload.xlsx` + `*_Missing-JQs.xlsx`
  → email report to recipients.
- `GET /asateel/run/{run_id}` → poll until `status` is `done` or `failed`.

Email is sent via the `gog` Gmail channel as `aljeel@accordpartners.ai`, and
`amr@accordpartners.ai` is **always cc'd** (house rule).

## 2. Base URL

- **Internal / on-droplet (preferred):** `http://127.0.0.1:5000`
- Public host `https://finance.aljeel.accordpartners.ai` is Cloudflare-Access protected;
  the `/asateel/*` routes live on the Flask app (port 5000). For agent-to-agent calls,
  use the local server.

## 3. Auth (required on every call)

Header: `X-Asateel-Trigger-Key: <secret>`
- Secret = `ASATEEL_TRIGGER_KEY` from the Flask service environment. Fetch from the
  operator / secrets store. The API never returns it.
- Missing/wrong key → `401 {"error":"unauthorized"}`.

## 4. Trigger a run

```bash
curl -sS -X POST http://127.0.0.1:5000/asateel/run \
  -H "Content-Type: application/json" \
  -H "X-Asateel-Trigger-Key: $ASATEEL_TRIGGER_KEY" \
  -d '{
        "archive_date": "2026-07-03",
        "folder_name": "Asateel-Central-July",
        "region": "CENTRAL",
        "batch_id": "AS26-014",
        "recipients": ["ljaradat@aljeel.com", "mlabadi@aljeel.com"]
      }'
```

Fields:
| field | required | rule |
|---|---|---|
| `archive_date` | yes | `YYYY-MM-DD` |
| `folder_name` | yes | non-empty; archive folder holding the batch inputs |
| `region` | yes | one of `CENTRAL`, `PROJECTS`, `ADMIN` (case-insensitive in) |
| `batch_id` | yes | non-empty; no `/` or `\`; trailing number drives output filenames |
| `recipients` | no | array of emails; omitted → env default / amr. amr always cc'd |

Success (202):
```json
{ "run_id": "9f2c…8c", "status": "queued", "queue_position": 1 }
```
Validation error → `400 {"error":"<reason>"}`.

## 5. Poll for status

```bash
curl -sS http://127.0.0.1:5000/asateel/run/9f2c…8c \
  -H "X-Asateel-Trigger-Key: $ASATEEL_TRIGGER_KEY"
```

Response:
```json
{
  "run_id": "9f2c…8c",
  "status": "running",           // queued | running | done | failed
  "region": "CENTRAL",
  "batch_id": "AS26-014",
  "created_at": "2026-07-03T07:40:00+00:00",
  "started_at": "2026-07-03T07:40:05+00:00",
  "finished_at": null,
  "email_sent": null,            // true/false once terminal
  "error": "…"                   // only when status=failed
}
```

Recommended: poll every **30–60s**. Pipeline timeout is **3 hours**.

## 6. Agent control loop (pseudocode)

```
POST /asateel/run  -> run_id                      (expect 202; on 400 stop + surface error)
loop:
    sleep 30-60s
    GET /asateel/run/{run_id}
    if status in {done, failed}: break
    if 404: abort  (service restarted OR bad id; do not retry blindly)
report:
    status == done   -> success; email_sent tells you if the report went out
    status == failed -> surface `error`
```

## 7. Gotchas (read before integrating)

- **In-memory registry/queue.** A Flask restart drops queued jobs and makes prior
  `run_id`s return `404`. Don't treat run history as durable; poll promptly.
- **Single worker, FIFO.** Concurrent triggers queue up; `queue_position` tells you where
  you land. Don't fire duplicate runs for the same batch.
- **`email_sent: false` on a `done` run** means the pipeline succeeded but the gog email
  failed (check Flask logs `tmp/flask.log`); the output files still exist on disk.
- **404 vs 401:** 401 = auth problem; 404 = unknown/expired run_id.

## 8. Where things live (operator reference)

- Route source: `scripts/asateel_trigger.py` (Flask blueprint, mounted in `droplet_api_flask.py`).
- Service: `aljeel-flask.service` (Flask on `0.0.0.0:5000`, workdir `.../aljeel`).
- Outputs: `aljeel/batches/asateel-<batch_id>/<Region>-<NN>-2026_{Oracle-upload,Missing-JQs}.xlsx`.
- Email channel: `gog gmail send` as `aljeel@accordpartners.ai` (cc amr).
