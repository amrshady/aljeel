Implemented the 4-file fix. No deployment was run.

**Diff Report**
- [scripts/droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:153)
  - Added batch size formatting, numeric batch sorting, and timed recursive size/count scanning.
  - Added `GET /batches`.
  - Scans `ROOT / "batches"` for `jawal-J26-###` dirs, requires `raw/`, counts files under `raw/`, formats size/date, and sorts newest first.

- [dashboard/public/_worker.js](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/_worker.js:233)
  - Added `GET /api/batches` proxy to droplet `/batches`.
  - Rejects non-GET with `405`.

- [dashboard/public/portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:294)
  - Replaced hardcoded batch rows with `#batch-list-loading` and `#batch-folder-list`.
  - Added `loadBatchList()` fetching `/api/batches`.
  - Renders `.folder-row` dynamically with Lucide-style folder SVG, ID, item count, size, modified date.
  - Switched row selection to event delegation.
  - Defaults to `J26-788`, or first/newest batch if unavailable.
  - Uses API `item_count` via `BATCH_ITEM_COUNTS`, with `ROW_COUNTS` as fallback.

- [dashboard/public/evidence.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/evidence.html:545)
  - Replaced hardcoded `<option>` list with an empty `<select id="batch-select">`.
  - Added `loadBatchList()` fetching `/api/batches`.
  - Defaults to `J26-788`, then triggers the existing `loadTree()` flow.

**Verification**
- `python3 -m py_compile scripts/droplet_api_flask.py` passed.
- Flask test client `GET /batches` returned `200` with sorted batch JSON.
- `node --check dashboard/public/_worker.js` passed.
- Inline JS parse checks passed for `portal.html` and `evidence.html`.

Note: this workspace is not a Git repository, so I couldn’t produce a native `git diff`; the report above reflects the applied diffs by file.

[status: done rc=0]
