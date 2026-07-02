import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from scripts import run_store


def iso(dt):
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


@pytest.fixture()
def store_root(tmp_path):
    root = tmp_path / "portal-root"
    run_store.init_schema(root=root)
    return root


def test_schema_idempotency(store_root):
    db = run_store.init_schema(root=store_root)
    run_store.init_schema(root=store_root)

    with run_store.connect(db) as conn:
        columns = [row["name"] for row in conn.execute("PRAGMA table_info(runs)").fetchall()]
        indexes = [row["name"] for row in conn.execute("PRAGMA index_list(runs)").fetchall()]

    assert columns == [name for name, _ in run_store.RUNS_SCHEMA_COLUMNS]
    assert "idx_runs_batch_created" in indexes


def test_cas_transition_success_and_stale_rejection(store_root):
    run = run_store.insert_run("J26-925", "manual", root=store_root)

    assert run_store.cas_transition(run["run_id"], "QUEUED", "PREFLIGHT", root=store_root)
    assert not run_store.cas_transition(run["run_id"], "QUEUED", "RUNNING", root=store_root)

    stored = run_store.get_run(run["run_id"], root=store_root)
    assert stored["state"] == "PREFLIGHT"
    assert stored["started_at"] is not None
    assert stored["heartbeat_at"] is not None


def test_full_lifecycle_to_succeeded(store_root):
    run = run_store.insert_run(
        "J26-925",
        "manual",
        root=store_root,
        evidence_root=store_root / "batches" / "jawal-J26-925",
        log_path=store_root / "tmp" / "pipeline-logs" / "run.log",
    )
    run_id = run["run_id"]
    assert run_store.cas_transition(run_id, "QUEUED", "PREFLIGHT", root=store_root, pid=123)
    assert run_store.cas_transition(run_id, "PREFLIGHT", "RUNNING", root=store_root)
    assert run_store.update_stage(run_id, "v30-llm", 2, 5, root=store_root)
    assert run_store.cas_transition(run_id, "RUNNING", "FINALIZING", root=store_root)

    artifacts = {
        "split": {
            "name": "Spreadsheet-J26-925-FILLED-v30-SPLIT.xlsx",
            "rel": "Spreadsheet-J26-925-FILLED-v30-SPLIT.xlsx",
            "bytes": 41080,
            "sha256": "abc123",
        },
        "summary": {"rel": "summary-v30.json"},
    }
    assert run_store.finalize_run(
        run_id,
        "SUCCEEDED",
        artifacts,
        root=store_root,
        exit_code=0,
        total_rows=67,
        flagged_rows=27,
        sar_at_risk=100049.59,
        hard_count=13,
    )

    stored = run_store.get_run(run_id, root=store_root)
    assert stored["state"] == "SUCCEEDED"
    assert stored["ended_at"] is not None
    assert stored["exit_code"] == 0
    assert json.loads(stored["artifacts_json"]) == artifacts
    manifest_path = Path(stored["run_dir"]) / "manifest.json"
    assert json.loads(manifest_path.read_text(encoding="utf-8")) == artifacts


def test_failed_and_cancelled_paths(store_root):
    failed = run_store.insert_run("J26-925", "manual", root=store_root)
    assert run_store.cas_transition(failed["run_id"], "QUEUED", "PREFLIGHT", root=store_root)
    assert run_store.cas_transition(failed["run_id"], "PREFLIGHT", "RUNNING", root=store_root)
    assert run_store.cas_transition(failed["run_id"], "RUNNING", "FINALIZING", root=store_root)
    assert run_store.finalize_run(
        failed["run_id"],
        "FAILED",
        {"split": None},
        root=store_root,
        exit_code=1,
        failure_reason="pipeline error",
    )
    assert run_store.get_run(failed["run_id"], root=store_root)["failure_reason"] == "pipeline error"

    cancelled = run_store.insert_run("J26-925", "manual", root=store_root)
    run_dir = Path(cancelled["run_dir"])
    (run_dir / "partial.txt").write_text("partial", encoding="utf-8")
    assert run_store.cas_transition(cancelled["run_id"], "QUEUED", "PREFLIGHT", root=store_root)
    assert run_store.finalize_run(
        cancelled["run_id"],
        "CANCELLED",
        root=store_root,
        expected_state="PREFLIGHT",
        failure_reason="operator cancelled",
    )
    stored = run_store.get_run(cancelled["run_id"], root=store_root)
    assert stored["state"] == "CANCELLED"
    assert stored["failure_reason"] == "operator cancelled"
    assert not run_dir.exists()


def test_stalled_detection(store_root):
    now = datetime(2026, 6, 26, 12, 0, 0, tzinfo=timezone.utc)
    old_heartbeat = iso(now - timedelta(seconds=121))
    fresh_heartbeat = iso(now - timedelta(seconds=120))

    stalled = {
        "state": "RUNNING",
        "heartbeat_at": old_heartbeat,
        "pid": 999999,
    }
    fresh = {
        "state": "RUNNING",
        "heartbeat_at": fresh_heartbeat,
        "pid": 999999,
    }
    alive = {
        "state": "RUNNING",
        "heartbeat_at": old_heartbeat,
        "pid": 999999,
    }

    assert run_store.is_stalled(stalled, now=now, pid_alive_fn=lambda pid: False)
    assert not run_store.is_stalled(fresh, now=now, pid_alive_fn=lambda pid: False)
    assert not run_store.is_stalled(alive, now=now, pid_alive_fn=lambda pid: True)


def test_reaper_grace_window(store_root):
    now = datetime(2026, 6, 26, 12, 0, 0, tzinfo=timezone.utc)

    within = run_store.insert_run("J26-925", "manual", root=store_root)
    assert run_store.cas_transition(
        within["run_id"],
        "QUEUED",
        "RUNNING",
        root=store_root,
        heartbeat_at=iso(now - timedelta(seconds=run_store.STALL_AFTER_SECONDS + 299)),
        pid=999999,
    )

    abandoned = run_store.insert_run("J26-925", "manual", root=store_root)
    assert run_store.cas_transition(
        abandoned["run_id"],
        "QUEUED",
        "RUNNING",
        root=store_root,
        heartbeat_at=iso(now - timedelta(seconds=run_store.STALL_AFTER_SECONDS + 301)),
        pid=999999,
    )

    preflight = run_store.insert_run("J26-925", "manual", root=store_root)
    assert run_store.cas_transition(
        preflight["run_id"],
        "QUEUED",
        "PREFLIGHT",
        root=store_root,
        heartbeat_at=iso(now - timedelta(seconds=run_store.STALL_AFTER_SECONDS + 301)),
        pid=999999,
    )

    reaped = run_store.reap_abandoned(root=store_root, now=now, pid_alive_fn=lambda pid: False)

    assert reaped == [abandoned["run_id"]]
    assert run_store.get_run(within["run_id"], root=store_root)["state"] == "RUNNING"
    assert run_store.get_run(preflight["run_id"], root=store_root)["state"] == "PREFLIGHT"
    stored = run_store.get_run(abandoned["run_id"], root=store_root)
    assert stored["state"] == "FAILED"
    assert stored["failure_reason"] == "abandoned"


def test_retention_prune_keeps_newest_20_artifacts_and_db_rows(store_root):
    base = datetime(2026, 6, 26, 12, 0, 0, tzinfo=timezone.utc)
    run_ids = []
    for offset in range(25):
        created_at = iso(base + timedelta(seconds=offset))
        run = run_store.insert_run(
            "J26-925",
            "manual",
            root=store_root,
            created_at=created_at,
            run_id=run_store.generate_run_id(
                "J26-925",
                base + timedelta(seconds=offset),
                suffix=f"{offset:06x}"[-6:],
            ),
        )
        Path(run["run_dir"], "artifact.txt").write_text(str(offset), encoding="utf-8")
        run_ids.append(run["run_id"])

    removed = run_store.prune_artifacts("J26-925", root=store_root)
    rows = run_store.history("J26-925", root=store_root, limit=30)

    assert len(removed) == 5
    assert len(rows) == 25
    newest_20 = set(reversed(run_ids[-20:]))
    oldest_5 = set(run_ids[:5])
    existing = {row["run_id"] for row in rows if Path(row["run_dir"]).exists()}
    missing = {row["run_id"] for row in rows if not Path(row["run_dir"]).exists()}
    assert existing == newest_20
    assert missing == oldest_5
