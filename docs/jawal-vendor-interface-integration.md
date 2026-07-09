# Jawal - Vendor Management AP Interface Integration

**Goal:** When the **Jawal provider** uploads invoices and the **AlJeel AP person clicks
Approve & Run**, that approval fires the Jawal reconciliation run via the trigger API and
the final spreadsheets are delivered by email.

This is a copy-paste integration recipe for whoever builds the vendor-management AP interface.

## 0. The flow in one line

```text
Jawal provider uploads invoices -> AlJeel AP sees "aljawal" -> AP clicks "Approve & Run"
   -> your backend calls POST /jawal/run -> you poll GET /jawal/run/{run_id} -> show status + email-sent
```

**Do NOT call the trigger API from the browser.** The trigger key is a server secret. The
approve button hits *your* backend; your backend holds the key and calls the trigger API.

## 1. Prerequisites

- Network reach to the Flask host. On-droplet the API is `http://127.0.0.1:5000`. If your
  vendor interface runs elsewhere, expose the `/jawal/*` routes to it over the internal
  network / tunnel and use that base URL.
- Store the trigger secret as a backend env var (never in frontend code):

```text
JAWAL_TRIGGER_KEY=<get from operator / secrets store>
JAWAL_API_BASE=http://127.0.0.1:5000
```

- If the provider uploads an invoice through the existing Flask `/upload` route, persist
  the returned absolute `path` and pass it as `invoice_path` during approval.
- Optional contract discovery: `GET {JAWAL_API_BASE}/jawal/openapi.json`.

## 2. Copy-paste: Node.js / Express approve handler

```js
// server-side only. JAWAL_TRIGGER_KEY + JAWAL_API_BASE live in backend env.
const API = process.env.JAWAL_API_BASE || "http://127.0.0.1:5000";
const KEY = process.env.JAWAL_TRIGGER_KEY;

// Called when the AlJeel AP person clicks "Approve & Run" for an aljawal batch.
async function onJawalApprove(req, res) {
  // These come from the submitted batch record and optional /upload result.
  const { batch_id, invoice_path, no_cache = true, recipients } = req.body;

  const r = await fetch(`${API}/jawal/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Jawal-Trigger-Key": KEY,
    },
    body: JSON.stringify({
      batch_id,      // e.g. "J26-954"
      invoice_path,  // optional absolute .xlsx/.xls path from /upload
      no_cache,      // optional boolean; default true
      recipients,    // optional array; omit to use server default. amr is always cc'd.
    }),
  });

  if (r.status === 401) return res.status(500).json({ error: "trigger auth misconfigured" });
  if (r.status === 400) return res.status(400).json(await r.json()); // validation error -> show to AP user
  if (r.status !== 202) return res.status(502).json({ error: "trigger failed", code: r.status });

  const { run_id, queue_position } = await r.json();
  // Persist run_id against this batch so the UI can poll + show status.
  await saveRunIdForBatch(batch_id, run_id);
  return res.json({ run_id, queue_position, status: "queued" });
}

// Poll endpoint your frontend hits every ~30-60s for a spinner + result.
async function getJawalStatus(req, res) {
  const runId = req.params.run_id;
  const r = await fetch(`${API}/jawal/run/${runId}`, {
    headers: { "X-Jawal-Trigger-Key": KEY },
  });
  if (r.status === 404) return res.status(404).json({ error: "run not found (may have expired)" });
  if (!r.ok) return res.status(502).json({ error: "status check failed", code: r.status });
  return res.json(await r.json()); // {status: queued|running|done|failed, email_sent, ...}
}
```

## 3. Copy-paste: Python / Flask approve handler

```python
import os, requests
API = os.environ.get("JAWAL_API_BASE", "http://127.0.0.1:5000")
KEY = os.environ["JAWAL_TRIGGER_KEY"]
HDR = {"X-Jawal-Trigger-Key": KEY}

def on_jawal_approve(payload: dict):
    # payload from the batch record + optional /upload result
    r = requests.post(f"{API}/jawal/run", headers={**HDR, "Content-Type": "application/json"}, json={
        "batch_id": payload["batch_id"],             # e.g. J26-954
        "invoice_path": payload.get("invoice_path"), # optional absolute path from /upload
        "no_cache": payload.get("no_cache", True),
        "recipients": payload.get("recipients"),     # optional
    }, timeout=30)
    if r.status_code == 400:
        return {"ok": False, "error": r.json().get("error")}   # show to AP user
    if r.status_code != 202:
        return {"ok": False, "error": f"trigger failed ({r.status_code})"}
    data = r.json()
    return {"ok": True, "run_id": data["run_id"], "queue_position": data["queue_position"]}

def jawal_status(run_id: str):
    r = requests.get(f"{API}/jawal/run/{run_id}", headers=HDR, timeout=30)
    if r.status_code == 404:
        return {"status": "unknown"}
    return r.json()
```

## 4. Frontend approve-button flow

The button must call **your backend** route, never the trigger API directly:

```js
// on "Approve & Run" click for a row where provider/vendor is "aljawal":
const resp = await fetch("/api/jawal/approve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ batch_id, invoice_path, recipients, no_cache: true }),
});
const { run_id } = await resp.json();
// then poll your own /api/jawal/status/:run_id every 30-60s and update the row
```

## 5. Mapping the UI to the payload

| Trigger field | Where it comes from in the vendor interface |
|---|---|
| `batch_id` | batch identifier assigned to this submission, e.g. `J26-954` |
| `invoice_path` | optional absolute path returned by the existing Flask `/upload` route for the invoice Excel file |
| `no_cache` | AP action default; use `true` for approval-triggered clean runs |
| `recipients` | optional; the AlJeel finance recipients for the report email |

## 6. Status semantics for the UI

Poll `GET /jawal/run/{run_id}` and drive the row state off `status`:
- `queued` -> "Waiting in queue (position N)"
- `running` -> spinner, "Reconciling..."
- `done` -> green; if `email_sent === true` show "Report emailed", else "Completed - email failed (files on server)"
- `failed` -> red; surface the `error` string to the AP user / ops

Guardrails to bake in:
- Disable the Approve button once a run is `queued`/`running` for that batch.
- Runs can take minutes to hours (3h timeout / lock wait budget). Poll every 30-60s.
- Registry is in-memory: a Flask restart makes an old `run_id` return `404`. Treat 404
  mid-run as "status lost - check ops / re-trigger", not as success.
- `invoice_path` must be the absolute file path returned by the server-side `/upload`
  route. Do not pass browser-local filenames like `C:\fakepath\invoice.xlsx`.

## 7. Contract source of truth

- Live JSON: `GET {JAWAL_API_BASE}/jawal/openapi.json` (no auth)
- Live YAML: `GET {JAWAL_API_BASE}/jawal/openapi.yaml` (no auth)
- Repo copy: `aljeel/docs/jawal-trigger-api.openapi.yaml` + `jawal-trigger-api.AGENT.md`
