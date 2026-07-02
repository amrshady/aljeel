Implemented Phase 0 only.

New files:
- [scripts/run_store.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_store.py): standalone SQLite store layer, no Flask import.
- [tests/test_run_store.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_run_store.py): pytest coverage for schema, CAS, lifecycle, failed/cancelled paths, stalled detection, reaper grace, and retention pruning.
- [state/runs.db](/home/clawdbot/.openclaw/workspace/aljeel/state/runs.db): initialized at the ROOT discovered from `scripts/droplet_api_flask.py`.

What changed:
- Added idempotent schema initialization/migration with the exact `runs` columns and `idx_runs_batch_created`.
- Added sortable run IDs like `J26-925-20260625T151520Z-a1b2c3`.
- Added `state/runs/<batch>/<run_id>/` helper creation.
- Added insert, get, newest-first history, CAS transitions, heartbeat, stage update, finalize/manifest write, STALLED computation, RUNNING-only abandoned reaper after 5-minute grace, and callable artifact pruning that keeps DB rows.
- `CANCELLED` finalization discards the run dir per G6.
- No HTTP endpoints, no worker, and no changes to `scripts/droplet_api_flask.py`.

Verification:
- `PYTHONPATH=/tmp/aljeel-pytest-target python3 -m pytest tests/test_run_store.py -q`
- Result: `7 passed in 1.37s`
- `python3 -m py_compile scripts/run_store.py tests/test_run_store.py` passed.

Note: this workspace is not a Git repository, so I could not produce a `git diff`; the diff is the three new files listed above.
