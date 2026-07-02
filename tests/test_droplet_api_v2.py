import json
import os
import subprocess
import sys
import textwrap
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from flask import Flask

from scripts import droplet_api_v2

run_store = droplet_api_v2.run_store


ACCESS_HEADERS = {droplet_api_v2.ACCESS_EMAIL_HEADER: "operator@example.com"}


def iso(dt):
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


@pytest.fixture()
def api_env(tmp_path, monkeypatch):
    root = tmp_path / "portal-root"
    root.mkdir()
    run_store.init_schema(root=root)
    monkeypatch.setattr(run_store, "ROOT", root)

    lock_path = root / "run.lock"
    lock_ts_path = root / "run.lock.ts"
    logs_dir = root / "tmp" / "pipeline-logs"
    logs_dir.mkdir(parents=True)

    monkeypatch.setattr(droplet_api_v2.v1, "ROOT", root)
    monkeypatch.setattr(droplet_api_v2.v1, "RUN_LOCK", lock_path)
    monkeypatch.setattr(droplet_api_v2.v1, "RUN_LOCK_TS", lock_ts_path)
    monkeypatch.setattr(droplet_api_v2.v1, "PIPELINE_LOGS_DIR", logs_dir)

    app = Flask(__name__)
    app.register_blueprint(droplet_api_v2.bp)
    return {"root": root, "client": app.test_client(), "lock": lock_path, "lock_ts": lock_ts_path}


def _insert_running_run(root: Path, *, evidence_root: Path | None = None, log_path: Path | None = None):
    run = run_store.insert_run("J26-925", "manual", root=root, evidence_root=evidence_root, log_path=log_path)
    assert run_store.cas_transition(run["run_id"], "QUEUED", "PREFLIGHT", root=root, pid=os.getpid())
    assert run_store.cas_transition(run["run_id"], "PREFLIGHT", "RUNNING", root=root, pid=os.getpid())
    return run_store.get_run(run["run_id"], root=root)


def test_reaper_timer_starts_once_and_manual_reap_uses_same_helper(api_env, monkeypatch):
    first = droplet_api_v2.start_reaper_timer()
    second = droplet_api_v2.start_reaper_timer()
    assert first is second
    assert first.daemon

    now = datetime.now(timezone.utc)
    abandoned = run_store.insert_run("J26-925", "manual", root=api_env["root"])
    assert run_store.cas_transition(
        abandoned["run_id"],
        "QUEUED",
        "RUNNING",
        root=api_env["root"],
        heartbeat_at=iso(now - timedelta(seconds=run_store.STALL_AFTER_SECONDS + run_store.REAPER_GRACE_SECONDS + 1)),
        pid=0,
    )

    monkeypatch.setattr(run_store, "pid_alive", lambda pid: False)
    response = api_env["client"].post("/v2/maintenance/reap", headers=ACCESS_HEADERS)
    assert response.status_code == 200
    assert response.get_json()["reaped"] == [abandoned["run_id"]]
    stored = run_store.get_run(abandoned["run_id"], root=api_env["root"])
    assert stored["state"] == "FAILED"
    assert stored["failure_reason"] == "abandoned"


def test_cancel_kills_worker_discards_run_dir_releases_lock_and_allows_next_run(api_env, monkeypatch):
    procs: list[subprocess.Popen[str]] = []

    worker_code = textwrap.dedent(
        """
        import json
        import os
        import sys
        import time
        from pathlib import Path

        sys.path.insert(0, str(Path.cwd()))
        from scripts import run_store

        root = Path(sys.argv[1])
        lock_path = Path(sys.argv[2])
        lock_ts_path = Path(sys.argv[3])
        batch_id = sys.argv[4]

        run_store.ROOT = root
        run_store.init_schema(root=root)
        created_at = run_store.utc_now()
        run_id = run_store.generate_run_id(batch_id, run_store.parse_utc(created_at))
        fd = os.open(lock_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.write(fd, f"{run_id}\\n".encode("utf-8"))
        lock_ts_path.write_text(json.dumps({"since": created_at, "run_id": run_id}), encoding="utf-8")
        run = run_store.insert_run(batch_id, "manual", root=root, run_id=run_id, pid=os.getpid(), created_at=created_at)
        Path(run["run_dir"], "partial.txt").write_text("partial", encoding="utf-8")
        run_store.cas_transition(run_id, "QUEUED", "PREFLIGHT", root=root, pid=os.getpid())
        run_store.cas_transition(run_id, "PREFLIGHT", "RUNNING", root=root, pid=os.getpid())
        while True:
            run_store.bump_heartbeat(run_id, root=root, pid=os.getpid())
            time.sleep(1)
        """
    )

    def fake_spawn(batch_id, *, no_cache, trigger, invoice_path=None):
        proc = subprocess.Popen(
            [sys.executable, "-u", "-c", worker_code, str(api_env["root"]), str(api_env["lock"]), str(api_env["lock_ts"]), batch_id],
            cwd=str(Path(__file__).resolve().parents[1]),
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            text=True,
        )
        procs.append(proc)
        return proc

    monkeypatch.setattr(droplet_api_v2, "_spawn_worker", fake_spawn)

    first = api_env["client"].post("/v2/batches/J26-925/runs", headers=ACCESS_HEADERS, json={})
    assert first.status_code == 202
    run_id = first.get_json()["run_id"]
    run = run_store.get_run(run_id, root=api_env["root"])
    assert run is not None
    run_dir = Path(run["run_dir"])
    assert run_dir.exists()
    assert api_env["lock"].exists()

    cancelled = api_env["client"].post(f"/v2/runs/{run_id}/cancel", headers=ACCESS_HEADERS)
    assert cancelled.status_code == 200
    assert cancelled.get_json()["state"] == "CANCELLED"
    assert run_store.get_run(run_id, root=api_env["root"])["state"] == "CANCELLED"
    assert not run_dir.exists()
    assert not api_env["lock"].exists()
    assert not api_env["lock_ts"].exists()
    assert procs[0].poll() is not None

    second = api_env["client"].post("/v2/batches/J26-925/runs", headers=ACCESS_HEADERS, json={})
    assert second.status_code == 202
    assert second.get_json()["run_id"] != run_id

    for proc in procs[1:]:
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, 15)
            except ProcessLookupError:
                pass
            proc.wait(timeout=10)
    droplet_api_v2.v1._clear_run_lock_files()


def test_evidence_rel_traversal_fuzz(api_env):
    evidence_root = api_env["root"] / "evidence"
    evidence_root.mkdir()
    (evidence_root / "safe.txt").write_text("safe", encoding="utf-8")
    outside = api_env["root"] / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("secret", encoding="utf-8")
    (evidence_root / "link-out").symlink_to(outside, target_is_directory=True)

    run = _insert_running_run(api_env["root"], evidence_root=evidence_root)
    client = api_env["client"]

    matrix = {
        "../outside/secret.txt": 400,
        "..%2foutside%2fsecret.txt": 400,
        str(outside / "secret.txt"): 400,
        "/etc/passwd": 400,
        "link-out/secret.txt": 400,
        "safe.txt\x00.jpg": 400,
        "missing.txt": 404,
        "safe.txt": 200,
    }
    observed = {}
    for rel, expected in matrix.items():
        response = client.get(f"/v2/runs/{run['run_id']}/evidence/file", headers=ACCESS_HEADERS, query_string={"rel": rel})
        observed[rel] = response.status_code
        assert response.status_code == expected
    assert observed == matrix


def test_log_offset_and_history_limit_fuzz(api_env):
    log_path = api_env["root"] / "run.log"
    log_path.write_text("line 1\nline 2\n", encoding="utf-8")
    run = _insert_running_run(api_env["root"], log_path=log_path)
    client = api_env["client"]

    offset_matrix = {"-10": 200, "999999999999": 200, "abc": 400, "1.5": 400, "0": 200}
    observed_offsets = {}
    for offset, expected in offset_matrix.items():
        response = client.get(f"/v2/runs/{run['run_id']}/log", headers=ACCESS_HEADERS, query_string={"offset": offset})
        observed_offsets[offset] = response.status_code
        assert response.status_code == expected
        if offset == "-10":
            assert response.get_json()["offset"] == 0
        if offset == "999999999999":
            payload = response.get_json()
            assert payload["offset"] == log_path.stat().st_size
            assert payload["eof"] is True

    limit_matrix = {"-10": 200, "0": 200, "1": 200, "200": 200, "201": 200, "999999": 200, "abc": 400, "1.5": 400}
    observed_limits = {}
    for limit, expected in limit_matrix.items():
        response = client.get("/v2/batches/J26-925/runs", headers=ACCESS_HEADERS, query_string={"limit": limit})
        observed_limits[limit] = response.status_code
        assert response.status_code == expected
        if expected == 200:
            assert len(response.get_json()["runs"]) <= 200

    assert observed_offsets == offset_matrix
    assert observed_limits == limit_matrix


def test_artifact_path_traversal_fuzz_for_download_and_report(api_env):
    run = run_store.insert_run("J26-925", "manual", root=api_env["root"])
    run_dir = Path(run["run_dir"])
    outside = api_env["root"] / "outside.xlsx"
    outside.write_bytes(b"outside")
    artifacts = {
        "split": {"name": "outside.xlsx", "rel": "../outside.xlsx", "bytes": outside.stat().st_size, "sha256": "x"},
        "report": {"xlsx": "../outside.xlsx", "md": "../outside.md", "generated_at": run_store.utc_now()},
    }
    assert run_store.cas_transition(run["run_id"], "QUEUED", "PREFLIGHT", root=api_env["root"])
    assert run_store.cas_transition(run["run_id"], "PREFLIGHT", "RUNNING", root=api_env["root"])
    assert run_store.cas_transition(run["run_id"], "RUNNING", "FINALIZING", root=api_env["root"])
    assert run_store.finalize_run(run["run_id"], "SUCCEEDED", artifacts, root=api_env["root"])
    assert run_dir.exists()

    download = api_env["client"].get(f"/v2/runs/{run['run_id']}/download", headers=ACCESS_HEADERS)
    report = api_env["client"].get(f"/v2/runs/{run['run_id']}/report", headers=ACCESS_HEADERS, query_string={"format": "xlsx"})
    invalid_report_format = api_env["client"].get(
        f"/v2/runs/{run['run_id']}/report", headers=ACCESS_HEADERS, query_string={"format": "../xlsx"}
    )

    assert download.status_code == 404
    assert report.status_code == 404
    assert invalid_report_format.status_code == 400
