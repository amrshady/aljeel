#!/usr/bin/env python3
"""SQLite run-state store for Portal v2.

This module is intentionally independent of Flask and the v1 API runtime.
"""

from __future__ import annotations

import ast
import json
import os
import secrets
import shutil
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable


ACTIVE_STATES = {"PREFLIGHT", "RUNNING", "FINALIZING"}
TERMINAL_STATES = {"SUCCEEDED", "FAILED", "CANCELLED"}
ALL_STATES = {"QUEUED", *ACTIVE_STATES, *TERMINAL_STATES}
STALL_AFTER_SECONDS = 120
REAPER_GRACE_SECONDS = 300
RETENTION_RUNS_PER_BATCH = 20

RUNS_SCHEMA_COLUMNS = (
    ("run_id", "TEXT PRIMARY KEY"),
    ("batch_id", "TEXT NOT NULL"),
    ("state", "TEXT NOT NULL"),
    ("trigger", "TEXT NOT NULL"),
    ("pid", "INTEGER"),
    ("created_at", "TEXT NOT NULL"),
    ("started_at", "TEXT"),
    ("ended_at", "TEXT"),
    ("heartbeat_at", "TEXT"),
    ("stage", "TEXT"),
    ("stage_index", "INTEGER"),
    ("stage_total", "INTEGER"),
    ("exit_code", "INTEGER"),
    ("failure_reason", "TEXT"),
    ("evidence_root", "TEXT"),
    ("log_path", "TEXT"),
    ("run_dir", "TEXT"),
    ("total_rows", "INTEGER"),
    ("flagged_rows", "INTEGER"),
    ("sar_at_risk", "REAL"),
    ("gl_cells_total", "INTEGER"),
    ("gl_cells_filled", "INTEGER"),
    ("gl_cells_blank", "INTEGER"),
    ("coverage_pct", "REAL"),
    ("hard_count", "INTEGER"),
    ("artifacts_json", "TEXT"),
)

CREATE_RUNS_SQL = """
CREATE TABLE IF NOT EXISTS runs (
  run_id        TEXT PRIMARY KEY,
  batch_id      TEXT NOT NULL,
  state         TEXT NOT NULL,
  trigger       TEXT NOT NULL,
  pid           INTEGER,
  created_at    TEXT NOT NULL,
  started_at    TEXT,
  ended_at      TEXT,
  heartbeat_at  TEXT,
  stage         TEXT,
  stage_index   INTEGER,
  stage_total   INTEGER,
  exit_code     INTEGER,
  failure_reason TEXT,
  evidence_root TEXT,
  log_path      TEXT,
  run_dir       TEXT,
  total_rows    INTEGER,
  flagged_rows  INTEGER,
  sar_at_risk   REAL,
  gl_cells_total INTEGER,
  gl_cells_filled INTEGER,
  gl_cells_blank INTEGER,
  coverage_pct  REAL,
  hard_count    INTEGER,
  artifacts_json TEXT
)
"""


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_utc(value: str | None) -> datetime | None:
    if not value:
        return None
    if value.endswith("Z"):
        value = f"{value[:-1]}+00:00"
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def discover_root() -> Path:
    """Read the v1 ROOT value without importing the Flask app."""
    flask_path = Path(__file__).with_name("droplet_api_flask.py")
    tree = ast.parse(flask_path.read_text(encoding="utf-8"), filename=str(flask_path))
    for node in tree.body:
        if not isinstance(node, ast.Assign):
            continue
        if not any(isinstance(target, ast.Name) and target.id == "ROOT" for target in node.targets):
            continue
        value = node.value
        if (
            isinstance(value, ast.Call)
            and isinstance(value.func, ast.Name)
            and value.func.id == "Path"
            and len(value.args) == 1
            and isinstance(value.args[0], ast.Constant)
            and isinstance(value.args[0].value, str)
        ):
            return Path(value.args[0].value)
    raise RuntimeError(f"Could not discover ROOT from {flask_path}")


ROOT = discover_root()


def state_dir(root: Path | str | None = None) -> Path:
    return Path(root or ROOT) / "state"


def db_path(root: Path | str | None = None) -> Path:
    return state_dir(root) / "runs.db"


def run_dir_for(batch_id: str, run_id: str, root: Path | str | None = None) -> Path:
    return state_dir(root) / "runs" / batch_id / run_id


def ensure_run_dir(batch_id: str, run_id: str, root: Path | str | None = None) -> Path:
    path = run_dir_for(batch_id, run_id, root)
    path.mkdir(parents=True, exist_ok=True)
    return path


def generate_run_id(batch_id: str, now: datetime | None = None, suffix: str | None = None) -> str:
    if now is None:
        now = datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    stamp = now.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{batch_id}-{stamp}-{suffix or secrets.token_hex(3)}"


def connect(path: Path | str | None = None, root: Path | str | None = None) -> sqlite3.Connection:
    resolved = Path(path) if path is not None else db_path(root)
    resolved.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(resolved))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(path: Path | str | None = None, root: Path | str | None = None) -> Path:
    resolved = Path(path) if path is not None else db_path(root)
    with connect(resolved) as conn:
        conn.execute(CREATE_RUNS_SQL)
        existing = {row["name"] for row in conn.execute("PRAGMA table_info(runs)").fetchall()}
        for name, definition in RUNS_SCHEMA_COLUMNS:
            if name not in existing:
                conn.execute(f"ALTER TABLE runs ADD COLUMN {name} {definition}")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_batch_created ON runs(batch_id, created_at DESC)")
    return resolved


def _row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    return None if row is None else dict(row)


def _connection(path: Path | str | None, root: Path | str | None) -> sqlite3.Connection:
    init_schema(path=path, root=root)
    return connect(path=path, root=root)


def insert_run(
    batch_id: str,
    trigger: str,
    *,
    run_id: str | None = None,
    pid: int | None = None,
    evidence_root: Path | str | None = None,
    log_path: Path | str | None = None,
    created_at: str | None = None,
    root: Path | str | None = None,
    path: Path | str | None = None,
) -> dict[str, Any]:
    if trigger not in {"manual", "rerun"}:
        raise ValueError("trigger must be 'manual' or 'rerun'")
    created_at = created_at or utc_now()
    run_id = run_id or generate_run_id(batch_id, parse_utc(created_at))
    run_dir = ensure_run_dir(batch_id, run_id, root)
    values = {
        "run_id": run_id,
        "batch_id": batch_id,
        "state": "QUEUED",
        "trigger": trigger,
        "pid": pid,
        "created_at": created_at,
        "evidence_root": str(evidence_root) if evidence_root is not None else None,
        "log_path": str(log_path) if log_path is not None else None,
        "run_dir": str(run_dir),
    }
    with _connection(path, root) as conn:
        conn.execute(
            """
            INSERT INTO runs (
              run_id, batch_id, state, trigger, pid, created_at,
              evidence_root, log_path, run_dir
            )
            VALUES (
              :run_id, :batch_id, :state, :trigger, :pid, :created_at,
              :evidence_root, :log_path, :run_dir
            )
            """,
            values,
        )
    return get_run(run_id, root=root, path=path) or values


def get_run(run_id: str, *, root: Path | str | None = None, path: Path | str | None = None) -> dict[str, Any] | None:
    with _connection(path, root) as conn:
        return _row_to_dict(conn.execute("SELECT * FROM runs WHERE run_id = ?", (run_id,)).fetchone())


def history(
    batch_id: str,
    *,
    limit: int = 50,
    root: Path | str | None = None,
    path: Path | str | None = None,
) -> list[dict[str, Any]]:
    with _connection(path, root) as conn:
        rows = conn.execute(
            "SELECT * FROM runs WHERE batch_id = ? ORDER BY created_at DESC LIMIT ?",
            (batch_id, int(limit)),
        ).fetchall()
    return [dict(row) for row in rows]


def cas_transition(
    run_id: str,
    from_state: str,
    to_state: str,
    *,
    root: Path | str | None = None,
    path: Path | str | None = None,
    **fields: Any,
) -> bool:
    if from_state not in ALL_STATES or to_state not in ALL_STATES:
        raise ValueError("unknown state")
    now = fields.pop("now", None) or utc_now()
    updates: dict[str, Any] = {"state": to_state}
    updates.update(fields)
    if to_state == "PREFLIGHT" and "started_at" not in updates:
        updates["started_at"] = now
    if to_state in ACTIVE_STATES and "heartbeat_at" not in updates:
        updates["heartbeat_at"] = now
    if to_state in TERMINAL_STATES and "ended_at" not in updates:
        updates["ended_at"] = now
    assignments = ", ".join(f"{key} = :{key}" for key in updates)
    params = dict(updates, run_id=run_id, from_state=from_state)
    with _connection(path, root) as conn:
        cursor = conn.execute(
            f"UPDATE runs SET {assignments} WHERE run_id = :run_id AND state = :from_state",
            params,
        )
        return cursor.rowcount == 1


def bump_heartbeat(
    run_id: str,
    *,
    heartbeat_at: str | None = None,
    pid: int | None = None,
    root: Path | str | None = None,
    path: Path | str | None = None,
) -> bool:
    fields: dict[str, Any] = {"heartbeat_at": heartbeat_at or utc_now()}
    if pid is not None:
        fields["pid"] = pid
    assignments = ", ".join(f"{key} = :{key}" for key in fields)
    with _connection(path, root) as conn:
        cursor = conn.execute(
            f"UPDATE runs SET {assignments} WHERE run_id = :run_id",
            dict(fields, run_id=run_id),
        )
        return cursor.rowcount == 1


def update_stage(
    run_id: str,
    stage: str,
    stage_index: int,
    stage_total: int,
    *,
    heartbeat_at: str | None = None,
    root: Path | str | None = None,
    path: Path | str | None = None,
) -> bool:
    with _connection(path, root) as conn:
        cursor = conn.execute(
            """
            UPDATE runs
            SET stage = ?, stage_index = ?, stage_total = ?, heartbeat_at = ?
            WHERE run_id = ?
            """,
            (stage, stage_index, stage_total, heartbeat_at or utc_now(), run_id),
        )
        return cursor.rowcount == 1


def _atomic_write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=f".tmp-{path.name}-", dir=str(path.parent), text=True)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as tmp:
            json.dump(payload, tmp, indent=2, sort_keys=True)
            tmp.write("\n")
        os.replace(tmp_name, path)
    except Exception:
        try:
            os.unlink(tmp_name)
        except OSError:
            pass
        raise


def finalize_run(
    run_id: str,
    terminal_state: str,
    artifacts: dict[str, Any] | None = None,
    *,
    expected_state: str = "FINALIZING",
    exit_code: int | None = None,
    failure_reason: str | None = None,
    total_rows: int | None = None,
    flagged_rows: int | None = None,
    sar_at_risk: float | None = None,
    gl_cells_total: int | None = None,
    gl_cells_filled: int | None = None,
    gl_cells_blank: int | None = None,
    coverage_pct: float | None = None,
    hard_count: int | None = None,
    ended_at: str | None = None,
    root: Path | str | None = None,
    path: Path | str | None = None,
) -> bool:
    if terminal_state not in TERMINAL_STATES:
        raise ValueError("terminal_state must be SUCCEEDED, FAILED, or CANCELLED")
    run = get_run(run_id, root=root, path=path)
    if not run:
        return False
    artifacts = artifacts or {}
    run_dir = Path(run["run_dir"] or run_dir_for(run["batch_id"], run_id, root))
    if terminal_state == "CANCELLED":
        shutil.rmtree(run_dir, ignore_errors=True)
        artifacts_json = json.dumps(artifacts, sort_keys=True)
    else:
        run_dir.mkdir(parents=True, exist_ok=True)
        _atomic_write_json(run_dir / "manifest.json", artifacts)
        artifacts_json = json.dumps(artifacts, sort_keys=True)
    return cas_transition(
        run_id,
        expected_state,
        terminal_state,
        root=root,
        path=path,
        now=ended_at,
        exit_code=exit_code,
        failure_reason=failure_reason,
        total_rows=total_rows,
        flagged_rows=flagged_rows,
        sar_at_risk=sar_at_risk,
        gl_cells_total=gl_cells_total,
        gl_cells_filled=gl_cells_filled,
        gl_cells_blank=gl_cells_blank,
        coverage_pct=coverage_pct,
        hard_count=hard_count,
        artifacts_json=artifacts_json,
    )


def pid_alive(pid: int | None) -> bool:
    if pid is None:
        return False
    if pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def is_stalled(
    run: dict[str, Any],
    *,
    now: datetime | None = None,
    pid_alive_fn: Callable[[int | None], bool] = pid_alive,
) -> bool:
    if run.get("state") not in ACTIVE_STATES:
        return False
    heartbeat = parse_utc(run.get("heartbeat_at"))
    if heartbeat is None:
        return False
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    gap = (now.astimezone(timezone.utc) - heartbeat).total_seconds()
    return gap > STALL_AFTER_SECONDS and not pid_alive_fn(run.get("pid"))


def stalled_runs(
    *,
    root: Path | str | None = None,
    path: Path | str | None = None,
    now: datetime | None = None,
    pid_alive_fn: Callable[[int | None], bool] = pid_alive,
) -> list[dict[str, Any]]:
    with _connection(path, root) as conn:
        rows = conn.execute(
            "SELECT * FROM runs WHERE state IN ('PREFLIGHT', 'RUNNING', 'FINALIZING')"
        ).fetchall()
    return [dict(row) for row in rows if is_stalled(dict(row), now=now, pid_alive_fn=pid_alive_fn)]


def reap_abandoned(
    *,
    root: Path | str | None = None,
    path: Path | str | None = None,
    now: datetime | None = None,
    pid_alive_fn: Callable[[int | None], bool] = pid_alive,
    grace_seconds: int = REAPER_GRACE_SECONDS,
) -> list[str]:
    now = now or datetime.now(timezone.utc)
    reaped: list[str] = []
    for run in stalled_runs(root=root, path=path, now=now, pid_alive_fn=pid_alive_fn):
        if run["state"] != "RUNNING":
            continue
        heartbeat = parse_utc(run.get("heartbeat_at"))
        if heartbeat is None:
            continue
        if (now - heartbeat).total_seconds() <= STALL_AFTER_SECONDS + grace_seconds:
            continue
        if cas_transition(
            run["run_id"],
            run["state"],
            "FAILED",
            root=root,
            path=path,
            now=now.isoformat().replace("+00:00", "Z"),
            failure_reason="abandoned",
        ):
            reaped.append(run["run_id"])
    return reaped


def prune_artifacts(
    batch_id: str,
    *,
    keep: int = RETENTION_RUNS_PER_BATCH,
    root: Path | str | None = None,
    path: Path | str | None = None,
) -> list[Path]:
    with _connection(path, root) as conn:
        rows = conn.execute(
            """
            SELECT run_dir
            FROM runs
            WHERE batch_id = ?
            ORDER BY created_at DESC
            LIMIT -1 OFFSET ?
            """,
            (batch_id, int(keep)),
        ).fetchall()
    removed: list[Path] = []
    for row in rows:
        run_dir = row["run_dir"]
        if not run_dir:
            continue
        path_obj = Path(run_dir)
        if path_obj.exists():
            shutil.rmtree(path_obj)
            removed.append(path_obj)
    return removed


def batch_ids(*, root: Path | str | None = None, path: Path | str | None = None) -> Iterable[str]:
    with _connection(path, root) as conn:
        rows = conn.execute("SELECT DISTINCT batch_id FROM runs ORDER BY batch_id").fetchall()
    return [row["batch_id"] for row in rows]


if __name__ == "__main__":
    print(init_schema())
