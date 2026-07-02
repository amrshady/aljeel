# Codex Run — Portal v2 Coverage Backend
Run id: cx-20260626-174319-452619
Status: done rc=0
Date: 2026-06-26

Implemented coverage KPIs across the v2 backend.

Changed:
- scripts/build_inconsistencies_report.py: added GL coverage computation and report-builder stdout fields.
- scripts/droplet_api_v2.py: adds coverage to report KPIs, persisted row updates, `/v2/batches` `last_run`, `/v2/batches/<id>/runs`, and run detail `summary`.
- scripts/run_store.py: additive nullable columns via safe `init_schema()` migration.
- scripts/run_worker_v2.py: persists the new coverage fields during normal run finalization.

Counted GL columns:
`Account`, `Cost Center`, `DIV`, `Solution`, `Agency`.

Excluded `Employee No` / `emp_no` from the denominator because sponsorship/family rows can have blank or non-scorable employee numbers by design, while the Oracle allocation combo still requires the five GL allocation fields above.

New fields:
`gl_cells_total`, `gl_cells_filled`, `gl_cells_blank`, `coverage_pct`.

Verification:
- AST parse passed for `droplet_api_v2.py`, `run_store.py`, `build_inconsistencies_report.py`, and `run_worker_v2.py`.
- `python3 -m pytest tests/test_run_store.py -q` could not run: system Python has no `pytest`; installing is blocked by the externally managed Python environment, and `venv` is unavailable because `ensurepip`/`python3-venv` is missing. NOTE: pytest NOT GREEN — could not run.
- Ran a direct run-store lifecycle sanity check successfully.
- Confirmed `/current-run` was unlocked before restart.
- Restarted Flask on port 5000; new process is running (`python3 scripts/droplet_api_flask.py`, PID `465213`).
- Backfilled existing `J26-788` runs after schema migration.

Observed `J26-788` result from the requested curl:
`coverage_pct: 82.8`, `gl_cells_total: 500`, `gl_cells_filled: 414`, `gl_cells_blank: 86` on both existing runs.
