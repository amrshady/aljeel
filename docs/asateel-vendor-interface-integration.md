# Asateel — Vendor Management AP Interface Integration

**Goal:** When the **Asateel provider** logs into the vendor portal and the **AlJeel AP person
clicks Approve**, that approval fires the Asateel reconciliation run via the trigger API.

This is a copy-paste integration recipe for whoever builds the vendor-management AP interface.

---

## 0. The flow in one line

```
Asateel provider logs in  ->  submits/uploads batch  ->  AlJeel AP reviews  ->  AP clicks "Approve & Run"
   ->  your backend calls POST /asateel/run  ->  you poll GET /asateel/run/{run_id}  ->  show status + email-sent
```

**Do NOT call the trigger API from the browser.** The trigger key is a server secret. The
approve button hits *your* backend; your backend holds the key and calls the trigger API.

---

## 1. Prerequisites (one-time, on your backend)

- Network reach to the Flask host. On-droplet the API is `http://127.0.0.1:5000`. If your
  vendor interface runs elsewhere, expose the `/asateel/*` routes to it over the internal
  network / tunnel and use that base URL.
- Store the trigger secret as a backend env var (never in frontend code):
  ```
  ASATEEL_TRIGGER_KEY=<get from operator / secrets store>
  ASATEEL_API_BASE=http://127.0.0.1:5000
  ```
- (Optional) Self-discover the contract at runtime: `GET {ASATEEL_API_BASE}/asateel/openapi.json`.

---

## 2. Copy-paste: Node.js / Express approve handler

```js
// server-side only. ASATEEL_TRIGGER_KEY + ASATEEL_API_BASE live in backend env.
const API = process.env.ASATEEL_API_BASE || "http://127.0.0.1:5000";
const KEY = process.env.ASATEEL_TRIGGER_KEY;

// Called when the AlJeel AP person clicks "Approve & Run" for an Asateel batch.
async function onAsateelApprove(req, res) {
  // These come from the batch record the provider submitted + the region selected in the UI.
  const { archive_date, folder_name, region, batch_id, recipients } = req.body;

  const r = await fetch(`${API}/asateel/run`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Asateel-Trigger-Key": KEY,
    },
    body: JSON.stringify({
      archive_date, // "YYYY-MM-DD"
      folder_name,  // archive folder holding the provider's uploaded inputs
      region,       // "CENTRAL" | "PROJECTS" | "ADMIN"
      batch_id,     // e.g. "AS26-014" (no slashes)
      recipients,   // optional array; omit to use server default. amr is always cc'd.
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
async function getAsateelStatus(req, res) {
  const runId = req.params.run_id;
  const r = await fetch(`${API}/asateel/run/${runId}`, {
    headers: { "X-Asateel-Trigger-Key": KEY },
  });
  if (r.status === 404) return res.status(404).json({ error: "run not found (may have expired)" });
  if (!r.ok) return res.status(502).json({ error: "status check failed", code: r.status });
  return res.json(await r.json()); // {status: queued|running|done|failed, email_sent, ...}
}
```

## 3. Copy-paste: Python / Flask approve handler

```python
import os, requests
API = os.environ.get("ASATEEL_API_BASE", "http://127.0.0.1:5000")
KEY = os.environ["ASATEEL_TRIGGER_KEY"]
HDR = {"X-Asateel-Trigger-Key": KEY}

def on_asateel_approve(payload: dict):
    # payload from the batch record + UI region selection
    r = requests.post(f"{API}/asateel/run", headers={**HDR, "Content-Type": "application/json"}, json={
        "archive_date": payload["archive_date"],  # "YYYY-MM-DD"
        "folder_name": payload["folder_name"],
        "region": payload["region"],               # CENTRAL | PROJECTS | ADMIN
        "batch_id": payload["batch_id"],           # no slashes
        "recipients": payload.get("recipients"),   # optional
    }, timeout=30)
    if r.status_code == 400:
        return {"ok": False, "error": r.json().get("error")}   # show to AP user
    if r.status_code != 202:
        return {"ok": False, "error": f"trigger failed ({r.status_code})"}
    data = r.json()
    return {"ok": True, "run_id": data["run_id"], "queue_position": data["queue_position"]}

def asateel_status(run_id: str):
    r = requests.get(f"{API}/asateel/run/{run_id}", headers=HDR, timeout=30)
    if r.status_code == 404:
        return {"status": "unknown"}
    return r.json()
```

## 4. Frontend (browser) — what the Approve button does

The button must call **your backend** route (which holds the key), never the trigger API directly:

```js
// on "Approve & Run" click:
const resp = await fetch("/api/asateel/approve", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ batch_id, region, archive_date, folder_name, recipients }),
});
const { run_id } = await resp.json();
// then poll your own /api/asateel/status/:run_id every 30-60s and update the row
```

## 5. Mapping the UI to the payload

| Trigger field | Where it comes from in the vendor interface |
|---|---|
| `archive_date` | date of the batch the provider uploaded (YYYY-MM-DD) |
| `folder_name` | the archive folder name where the provider's files were staged |
| `region` | region selector on the AP review screen (CENTRAL / PROJECTS / ADMIN) |
| `batch_id` | the batch identifier assigned to this submission (e.g. AS26-014) |
| `recipients` | optional; the AlJeel finance recipients for the report email |

## 6. Status semantics for the UI

Poll `GET /asateel/run/{run_id}` and drive the row state off `status`:
- `queued` → "Waiting in queue (position N)"
- `running` → spinner, "Reconciling…"
- `done` → green; if `email_sent === true` show "Report emailed", else "Completed — email failed (files on server)"
- `failed` → red; surface the `error` string to the AP user / ops

Guardrails to bake in:
- Disable the Approve button once a run is `queued`/`running` for that batch (single FIFO worker; don't double-fire).
- Runs can take minutes to hours (3h timeout). Poll every 30-60s, not tighter.
- Registry is in-memory: a Flask restart makes an old `run_id` return `404`. Treat 404 mid-run as "status lost — check ops / re-trigger", not as success.

## 7. Contract source of truth

- Live JSON: `GET {ASATEEL_API_BASE}/asateel/openapi.json` (no auth)
- Live YAML: `GET {ASATEEL_API_BASE}/asateel/openapi.yaml` (no auth)
- Repo copy: `aljeel/docs/asateel-trigger-api.openapi.yaml` + `asateel-trigger-api.AGENT.md`
