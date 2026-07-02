# Portal v2 — Phase 9 Backend Hardening

Run: cx-20260626-095121-3997608 — status: done rc=0
Date: 2026-06-26

Implemented Phase 9 backend hardening.

**Changed**
- scripts/droplet_api_v2.py
  - Added daemon reaper timer, started with `@bp.record_once` at blueprint registration.
  - Timer calls the same `run_store.reap_abandoned()` path as `/v2/maintenance/reap`, so the existing CAS transition logic remains the single writer.
  - Added shared `_run_reaper_once()` for timer + manual reap.
  - Hardened evidence `rel` handling with percent-decode, null-byte rejection, absolute-path rejection, symlink escape containment.
  - Fixed trigger polling so a new POST cannot accidentally return a pre-existing recent terminal run.
- tests/test_droplet_api_v2.py
  - Added v2 API tests for reaper, cancel, evidence path fuzzing, log offset fuzzing, limit fuzzing, and artifact/report traversal.

**Restart**
- Verified `/current-run` was idle: `{"locked":false,"run_id":null,"since":null}`.
- Restarted Flask to load the reaper timer.
- New live Flask PID: `4008883`.
- `/v2/ping` returns `{"ok":true}`.

**Validation**
- `python3 -m py_compile scripts/droplet_api_v2.py tests/test_droplet_api_v2.py tests/test_run_store.py` passed.
- `pytest` is not installed in this environment, so I also ran a direct Flask test-client harness. It passed:
  - reaper manual path promoted abandoned RUNNING to FAILED
  - cancel killed subprocess, removed run dir, cleared lock, second trigger returned `202` not `409`
  - fuzz matrices matched expected responses

**Fuzz Matrix**
- Evidence `rel`:
  - `../outside/secret.txt` -> `400`
  - `..%2foutside%2fsecret.txt` -> `400`
  - absolute temp path -> `400`
  - `/etc/passwd` -> `400`
  - symlink escape `link-out/secret.txt` -> `400`
  - null byte `safe.txt\x00.jpg` -> `400`
  - missing safe file -> `404`
  - valid `safe.txt` -> `200`
- Log `offset`:
  - `-10` -> `200`, clamped to `0`
  - huge offset -> `200`, clamped to EOF
  - `abc` -> `400`
  - `1.5` -> `400`
  - `0` -> `200`
- History `limit`:
  - `-10`, `0`, `1`, `200`, `201`, `999999` -> `200`, clamped into `1..200`
  - `abc`, `1.5` -> `400`
- Artifact/report traversal:
  - split artifact `../outside.xlsx` -> `404`
  - report xlsx `../outside.xlsx` -> `404`
  - report format `../xlsx` -> `400`

**Soak**
- Largest discovered batch was `J26-593` with 232 evidence items.
  - Run: `J26-593-20260626T100012Z-160cb0`
  - Terminal state: `FAILED`
  - Duration: `1359s`
  - Reason: `Stage 3 (AI Consistency Check) failed with code 1`
  - This proved detached-client terminal persistence, but no SPLIT because the pipeline failed before finalizing.
- Success soak used known-good `J26-788`.
  - Run: `J26-788-20260626T102306Z-4becd5`
  - Batch evidence items: 172 discovered; evidence snapshot captured 246 files
  - Terminal state: `SUCCEEDED`
  - Duration: `492s`
  - SPLIT: `Spreadsheet-J26-788-FILLED-v30-SPLIT.xlsx`
  - SPLIT bytes: `56328`
  - SHA256: `1af32fbe1e0fd6dd9207f7270a6b3f96b05ca4bc2044c0f2c1394f960bdd9b4e`
  - Download verified: `/v2/runs/J26-788-20260626T102306Z-4becd5/download` returned `200`, `Content-Length: 56328`
  - Lock released afterward: `/current-run` returned unlocked
  - No SSE/log stream was attached; trigger client closed after POST, state was later recovered from `/v2/runs/<id>`.

Memory sanity: Flask ended at about `65 MB RSS`. Large worker child memory peaked high during `J26-593` v30, around `2.06 GB RSS`, then released; `J26-788` child peak observed around `612 MB RSS`. API process memory stayed bounded.

[status: done rc=0]
