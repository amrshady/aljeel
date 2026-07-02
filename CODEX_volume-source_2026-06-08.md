Implemented in [scripts/droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:26).

Changed:
- Added module-level `VOLUME_BASE = Path("/mnt/aljeel_ap_kb/current")`.
- Added `_resolve_volume_evidence_root(batch_id)` with BFS depth 3 for numeric/date-like subfolders.
- Replaced `_evidence_raw_dir()` implementation to use volume first, then `batches/jawal-{batch_id}/raw`.
- Updated `GET /batches` to scan volume first, fallback to legacy `batches/`, dedupe by batch id, and include `source`.
- Left `_evidence_raw_dir()` callers unchanged.

Verification passed:
- `python3 -m py_compile scripts/droplet_api_flask.py`
- Requested smoke test:
  - `J26-815: /mnt/aljeel_ap_kb/current/J26-815/wetransfer_24-31may_2026-06-08_0950/24-31may`
  - `J26-788: /mnt/aljeel_ap_kb/current/J26-788`
  - `J26-999: None`
- `/batches` test client returns `200` with 8 volume-backed batches sorted newest first.

[status: done rc=0]
