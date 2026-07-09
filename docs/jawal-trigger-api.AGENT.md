# Jawal Reconciliation Trigger API - Agent Integration Guide

**Audience:** an AI agent or backend function that needs to trigger the AlJeel Jawal
reconciliation pipeline and report the outcome. Internal use only.

**Machine-readable spec:** [`jawal-trigger-api.openapi.yaml`](./jawal-trigger-api.openapi.yaml) (OpenAPI 3.1).
Load that spec for exact schemas; this file is the quick operational playbook.

## 1. What this API does

It runs the **Jawal** reconciliation as an async job:
- `POST /jawal/run` -> enqueues a job, returns `run_id` (HTTP 202).
- A single background worker runs one job at a time (FIFO), using the same end-to-end
  pipeline as the existing `/process` route: invoice conversion when supplied, cascade,
  v30 LLM handling, AI parsing/fraud audit, Excel injection, review JSON rebuild, split
  output, public output promotion, audit export, and dashboard deploy.
- `GET /jawal/run/{run_id}` -> poll until `status` is `done` or `failed`.

Email is sent via the `gog` Gmail channel as `aljeel@accordpartners.ai`, and
`amr@accordpartners.ai` is **always cc'd** (house rule).

## 2. Base URL

- **Internal / on-droplet (preferred):** `http://127.0.0.1:5000`
- Public host `https://finance.aljeel.accordpartners.ai` is Cloudflare-Access protected;
  the `/jawal/*` routes live on the Flask app (port 5000). For agent-to-agent calls,
  use the local server.

## 3. Auth

Protected routes require:

```text
X-Jawal-Trigger-Key: <secret>
```

- Secret = `JAWAL_TRIGGER_KEY` from the Flask service environment. Fetch from the
  operator / secrets store. The API never returns it.
- Missing/wrong key -> `401 {"error":"unauthorized"}`.
- `/jawal/openapi.json` and `/jawal/openapi.yaml` do not require auth.

## 4. Trigger a run

```bash
curl -sS -X POST http://127.0.0.1:5000/jawal/run \
  -H "Content-Type: application/json" \
  -H "X-Jawal-Trigger-Key: $JAWAL_TRIGGER_KEY" \
  -d '{
        "batch_id": "J26-954",
        "invoice_path": "/home/clawdbot/.openclaw/workspace/aljeel/uploads/portal/abc123/invoice.xlsx",
        "no_cache": true,
        "recipients": ["ljaradat@aljeel.com", "mlabadi@aljeel.com"]
      }'
```

Fields:
| field | required | rule |
|---|---|---|
| `batch_id` | yes | must match `^J26-\d+$` |
| `invoice_path` | no | absolute path to `.xlsx`/`.xls` staged by `/upload`; omitted -> on-disk batch discovery |
| `no_cache` | no | boolean; default `true` for a clean run |
| `recipients` | no | array of emails; omitted -> env default / amr. amr always cc'd |

Success (202):

```json
{ "run_id": "9f2c...8c", "status": "queued", "queue_position": 1 }
```

Validation error -> `400 {"error":"<reason>"}`.

## 5. Poll for status

```bash
curl -sS http://127.0.0.1:5000/jawal/run/9f2c...8c \
  -H "X-Jawal-Trigger-Key: $JAWAL_TRIGGER_KEY"
```

Response:

```json
{
  "run_id": "9f2c...8c",
  "status": "running",
  "batch_id": "J26-954",
  "created_at": "2026-07-05T07:40:00+00:00",
  "started_at": "2026-07-05T07:40:05+00:00",
  "finished_at": null,
  "email_sent": null,
  "error": "..."
}
```

Recommended: poll every **30-60s**. Pipeline timeout / lock wait budget is **3 hours**.

## 6. Agent control loop

```text
POST /jawal/run  -> run_id                      (expect 202; on 400 stop + surface error)
loop:
    sleep 30-60s
    GET /jawal/run/{run_id}
    if status in {done, failed}: break
    if 404: abort  (service restarted OR bad id; do not retry blindly)
report:
    status == done   -> success; email_sent tells you if the report went out
    status == failed -> surface `error`
```

## 7. Gotchas

- **In-memory registry/queue.** A Flask restart drops queued jobs and makes prior
  `run_id`s return `404`.
- **Single worker, FIFO.** Concurrent triggers queue up; `queue_position` tells you where
  you land. The trigger also respects the existing `/process` `run.lock`, so it will wait
  rather than overlap with a portal-started run.
- **`email_sent: false` on a `done` run** means the pipeline succeeded but the gog email
  failed; the output files still exist on disk.
- **404 vs 401:** 401 = auth problem; 404 = unknown/expired run_id.

## 8. Where things live

- Route source: `scripts/jawal_trigger.py` (Flask blueprint, mounted in `droplet_api_flask.py`).
- Pipeline source of truth: `scripts/droplet_api_flask.py` `_run_pipeline_worker`.
- Service: `aljeel-flask.service` (Flask on `0.0.0.0:5000`, workdir `.../aljeel`).
- Outputs: `aljeel/batches/jawal-<batch_id>/output/Spreadsheet-<batch_id>-FILLED-v30.xlsx`
  and `Spreadsheet-<batch_id>-FILLED-v30-SPLIT.xlsx`.
- Email channel: `gog gmail send` as `aljeel@accordpartners.ai` (cc amr).
