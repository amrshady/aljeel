# Portal v2 — Phase 1: Lifecycle Worker

Run: `cx-20260626-042947-3564883` (Codex) — completed rc=0, 2026-06-26 UTC

## Deliverable

Implemented Phase 1 worker in `scripts/run_worker_v2.py`.

### What it does
- Uses the existing v1 lock: `run.lock` / `run.lock.ts` with `os.O_CREAT | os.O_EXCL`.
- Drives `run_store.py` lifecycle: `QUEUED -> PREFLIGHT -> RUNNING -> FINALIZING -> SUCCEEDED/FAILED/CANCELLED`.
- Wraps the verified v1 stage order: preflight, `process_batch.py`, `run_v30.py`, document parser, fraud detector, injection, review JSON, `split_multi_emp.py`.
- Skips v1 Cloudflare deploy, per constraint.
- Heartbeats during long child processes.
- Snapshots SPLIT XLSX, `summary-v30.json`, `evidence-tree.json`, generated inconsistencies report, `run.log`, and `manifest.json` into the immutable run dir.
- CLI: `python3 scripts/run_worker_v2.py <BATCH_ID> [--no-cache] [--trigger manual|rerun]`
- Handles lock-busy via `RunLockBusy` and CLI exit `75`.
- Handles cancellation via `SIGTERM`/`SIGINT`: kills child process, removes run dir, marks `CANCELLED`.

## End-to-end verification (no client attached)

```text
batch: J26-788
run_id: J26-788-20260626T043340Z-075b83
state: SUCCEEDED
total_rows: 100
flagged_rows: 45
sar_at_risk: 73552.14
hard_count: 15
```

Run dir: `/home/clawdbot/.openclaw/workspace/aljeel/state/runs/J26-788/J26-788-20260626T043340Z-075b83`

Files present:
```text
Inconsistencies-Report-J26-788.md 509 bytes
Inconsistencies-Report-J26-788.xlsx 17434 bytes
Spreadsheet-J26-788-FILLED-v30-SPLIT.xlsx 56330 bytes
evidence-tree.json 76627 bytes
manifest.json 634 bytes
run.log 34653 bytes
summary-v30.json 1094 bytes
```

Lock cleanup confirmed: `run.lock` cleared, `run.lock.ts` cleared.

## Diff summary
- Added `scripts/run_worker_v2.py`.
- Verification updated `state/runs.db` and created the immutable run artifact directory above.
