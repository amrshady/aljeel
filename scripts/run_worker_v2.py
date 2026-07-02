#!/usr/bin/env python3
"""Portal v2 lifecycle worker for Jawal AP reconciliation runs.

This module intentionally has no Flask dependency at its public boundary.  It
can be spawned by a future API process or run directly from the CLI.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import select
import shutil
import signal
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import run_store  # noqa: E402
import droplet_api_flask as v1  # noqa: E402


class RunLockBusy(RuntimeError):
    """Raised when the v1 exclusive pipeline lock is already held."""


class RunCancelled(RuntimeError):
    """Raised internally when the current worker is asked to cancel."""


STAGES = (
    "preflight",
    "cascade",
    "v30-llm",
    "document-parser",
    "fraud",
    "inject",
    "review",
    "split",
    "finalize",
)

_cancel_requested = False
_current_child: subprocess.Popen[str] | None = None


def _normalize_batch_id(batch_id: str) -> str:
    return v1._normalize_batch_id(batch_id)


def _utc_now_for_log() -> str:
    return datetime.now(timezone.utc).isoformat()


def _write_log(log_handle: Any, message: str) -> None:
    v1._write_pipeline_log(log_handle, message)


def _atomic_copy(src: Path | str, dst: Path | str) -> None:
    v1._atomic_copy(src, dst)


def _acquire_v1_lock(run_id: str) -> int:
    try:
        lock_fd = os.open(v1.RUN_LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError as exc:
        raise RunLockBusy("pipeline lock is already held") from exc

    started_at = _utc_now_for_log()
    try:
        os.write(lock_fd, f"{run_id}\n".encode("utf-8"))
        v1.RUN_LOCK_TS.write_text(
            json.dumps({"since": started_at, "run_id": run_id}),
            encoding="utf-8",
        )
    except Exception:
        _release_v1_lock(lock_fd)
        raise
    return lock_fd


def _release_v1_lock(lock_fd: int | None) -> None:
    if lock_fd is None:
        return
    v1._release_run_lock(lock_fd)


def _install_signal_handlers() -> None:
    if threading.current_thread() is not threading.main_thread():
        return

    def _handler(signum: int, _frame: Any) -> None:
        global _cancel_requested
        _cancel_requested = True
        child = _current_child
        if child and child.poll() is None:
            _terminate_child(child)

    signal.signal(signal.SIGTERM, _handler)
    signal.signal(signal.SIGINT, _handler)


def _terminate_child(proc: subprocess.Popen[str]) -> None:
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    except Exception:
        proc.terminate()
    try:
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except Exception:
            proc.kill()
        proc.wait(timeout=10)


def _check_cancelled(run_id: str) -> None:
    if _cancel_requested:
        raise RunCancelled("cancel requested")
    run = run_store.get_run(run_id)
    if run and run.get("state") == "CANCELLED":
        raise RunCancelled("run marked CANCELLED")


def _run_logged_command(
    run_id: str,
    cmd: list[str],
    log_handle: Any,
    *,
    cwd: str | Path | None = None,
    env: dict[str, str] | None = None,
) -> int:
    global _current_child
    proc = subprocess.Popen(
        cmd,
        cwd=str(cwd) if cwd is not None else None,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,
    )
    _current_child = proc
    last_output = time.time()
    last_heartbeat = 0.0
    try:
        while True:
            _check_cancelled(run_id)
            now = time.time()
            if now - last_heartbeat >= 10:
                run_store.bump_heartbeat(run_id, pid=os.getpid())
                last_heartbeat = now

            assert proc.stdout is not None
            ready, _, _ = select.select([proc.stdout], [], [], 2.0)
            if ready:
                line = proc.stdout.readline()
                if not line:
                    break
                stripped = line.strip()
                if stripped:
                    _write_log(log_handle, stripped)
                    try:
                        log_handle.flush()
                    except Exception:
                        pass
                last_output = time.time()
            elif proc.poll() is not None:
                break
            elif time.time() - last_output >= 30:
                elapsed = int(time.time() - last_output)
                _write_log(log_handle, f"[API] ... still running ({elapsed}s since last output)")
                try:
                    log_handle.flush()
                except Exception:
                    pass
                last_output = time.time()
        proc.wait()
        return int(proc.returncode or 0)
    except RunCancelled:
        if proc.poll() is None:
            _terminate_child(proc)
        raise
    finally:
        _current_child = None


def _set_stage(run_id: str, stage: str, stage_index: int, log_handle: Any, message: str) -> None:
    run_store.update_stage(run_id, stage, stage_index, len(STAGES))
    run_store.bump_heartbeat(run_id, pid=os.getpid())
    _write_log(log_handle, message)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _artifact_entry(path: Path, run_dir: Path) -> dict[str, Any]:
    stat = path.stat()
    return {
        "name": path.name,
        "rel": path.relative_to(run_dir).as_posix(),
        "bytes": stat.st_size,
        "sha256": _sha256(path),
    }


def _copy_artifact(src: Path, run_dir: Path) -> Path:
    if not src.exists():
        raise FileNotFoundError(f"required artifact missing: {src}")
    dst = run_dir / src.name
    _atomic_copy(src, dst)
    return dst


def _write_evidence_tree(evidence_root: Path, run_dir: Path) -> dict[str, Any]:
    captured_at = run_store.utc_now()
    files: list[dict[str, Any]] = []
    folders: list[dict[str, Any]] = []
    if evidence_root.exists():
        for dirpath, dirnames, filenames in os.walk(evidence_root):
            current = Path(dirpath)
            dirnames.sort()
            filenames.sort()
            rel_dir = "." if current == evidence_root else current.relative_to(evidence_root).as_posix()
            try:
                dir_stat = current.stat()
                folders.append({"rel": rel_dir, "mtime": datetime.fromtimestamp(dir_stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z")})
            except OSError:
                pass
            for filename in filenames:
                file_path = current / filename
                try:
                    stat = file_path.stat()
                except OSError:
                    continue
                if not file_path.is_file():
                    continue
                files.append(
                    {
                        "rel": file_path.relative_to(evidence_root).as_posix(),
                        "name": filename,
                        "ext": file_path.suffix.lower().lstrip("."),
                        "bytes": stat.st_size,
                        "mtime": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat().replace("+00:00", "Z"),
                    }
                )

    payload = {
        "evidence_root": str(evidence_root),
        "captured_at": captured_at,
        "folder_count": len(folders),
        "file_count": len(files),
        "folders": folders,
        "files": files,
    }
    tree_path = run_dir / "evidence-tree.json"
    tree_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return {"rel": tree_path.relative_to(run_dir).as_posix(), "captured_at": captured_at, "file_count": len(files), "folder_count": len(folders)}


def _load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def _parse_report_stdout(text: str) -> dict[str, Any]:
    match = re.search(r"flagged_rows=(\d+);\s*at_risk_sar=([0-9.,-]+)", text)
    kpis: dict[str, Any] = {}
    if match:
        kpis["flagged_rows"] = int(match.group(1))
        kpis["sar_at_risk"] = float(match.group(2).replace(",", ""))

    coverage_match = re.search(
        r"coverage_pct=([0-9.]+|None|null);\s*gl_cells_total=(\d+);\s*"
        r"gl_cells_filled=(\d+);\s*gl_cells_blank=(\d+)",
        text,
    )
    if coverage_match:
        coverage_raw = coverage_match.group(1)
        kpis["coverage_pct"] = None if coverage_raw in {"None", "null"} else float(coverage_raw)
        kpis["gl_cells_total"] = int(coverage_match.group(2))
        kpis["gl_cells_filled"] = int(coverage_match.group(3))
        kpis["gl_cells_blank"] = int(coverage_match.group(4))

    return kpis


def _build_and_snapshot_report(
    run_id: str,
    batch_id: str,
    output_dir: Path,
    run_dir: Path,
    log_handle: Any,
    env: dict[str, str],
) -> tuple[dict[str, Any], dict[str, Any], int | None]:
    report_cmd = ["python3", "-u", str(SCRIPTS / "build_inconsistencies_report.py"), batch_id]
    proc = subprocess.Popen(
        report_cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,
        env=env,
    )
    stdout_lines: list[str] = []
    global _current_child
    _current_child = proc
    try:
        assert proc.stdout is not None
        for line in iter(proc.stdout.readline, ""):
            _check_cancelled(run_id)
            stripped = line.strip()
            if stripped:
                stdout_lines.append(stripped)
                _write_log(log_handle, stripped)
            run_store.bump_heartbeat(run_id, pid=os.getpid())
        proc.wait()
    except RunCancelled:
        if proc.poll() is None:
            _terminate_child(proc)
        raise
    finally:
        _current_child = None
    if proc.returncode != 0:
        raise RuntimeError(f"report generation failed with code {proc.returncode}")

    report_xlsx = output_dir / f"Inconsistencies-Report-{batch_id}.xlsx"
    report_md = output_dir / f"Inconsistencies-Report-{batch_id}.md"
    copied_xlsx = _copy_artifact(report_xlsx, run_dir)
    copied_md = _copy_artifact(report_md, run_dir)
    kpis = _parse_report_stdout("\n".join(stdout_lines))

    hard_count = None
    for line in stdout_lines:
        match = re.search(r"Hard Inconsistencies=(\d+)", line)
        if match:
            hard_count = int(match.group(1))
            break

    return (
        {
            "xlsx": copied_xlsx.relative_to(run_dir).as_posix(),
            "md": copied_md.relative_to(run_dir).as_posix(),
            "generated_at": run_store.utc_now(),
        },
        kpis,
        hard_count,
    )


def _finalize_success(
    run_id: str,
    batch_id: str,
    batch_dir: Path,
    raw_dir: Path,
    log_path: Path,
    log_handle: Any,
    env: dict[str, str],
) -> None:
    if not run_store.cas_transition(run_id, "RUNNING", "FINALIZING", pid=os.getpid()):
        raise RuntimeError("could not enter FINALIZING")
    _set_stage(run_id, "finalize", len(STAGES), log_handle, "[API] >> FINALIZING: Snapshotting v2 artifacts...")

    output_dir = batch_dir / "output"
    run = run_store.get_run(run_id)
    if not run:
        raise RuntimeError(f"run disappeared from store: {run_id}")
    run_dir = Path(run["run_dir"])
    run_dir.mkdir(parents=True, exist_ok=True)

    split_src = output_dir / f"Spreadsheet-{batch_id}-FILLED-v30-SPLIT.xlsx"
    summary_src = output_dir / "summary-v30.json"
    split_dst = _copy_artifact(split_src, run_dir)
    summary_dst = _copy_artifact(summary_src, run_dir)
    evidence_snapshot = _write_evidence_tree(raw_dir, run_dir)
    report_manifest, report_kpis, hard_count = _build_and_snapshot_report(
        run_id,
        batch_id,
        output_dir,
        run_dir,
        log_handle,
        env,
    )

    run_log_dst = run_dir / "run.log"
    _atomic_copy(log_path, run_log_dst)

    summary = _load_json(summary_dst, {})
    total_rows = summary.get("total_rows") or summary.get("total_lines")
    artifacts = {
        "split": _artifact_entry(split_dst, run_dir),
        "report": report_manifest,
        "summary": {"rel": summary_dst.relative_to(run_dir).as_posix()},
        "evidence_snapshot": evidence_snapshot,
        "log": {"rel": run_log_dst.relative_to(run_dir).as_posix()},
    }

    if not run_store.finalize_run(
        run_id,
        "SUCCEEDED",
        artifacts,
        exit_code=0,
        total_rows=int(total_rows) if total_rows is not None else None,
        flagged_rows=report_kpis.get("flagged_rows"),
        sar_at_risk=report_kpis.get("sar_at_risk"),
        gl_cells_total=report_kpis.get("gl_cells_total"),
        gl_cells_filled=report_kpis.get("gl_cells_filled"),
        gl_cells_blank=report_kpis.get("gl_cells_blank"),
        coverage_pct=report_kpis.get("coverage_pct"),
        hard_count=hard_count,
    ):
        raise RuntimeError("could not mark run SUCCEEDED")
    _write_log(log_handle, "[PIPELINE_SUCCESS]")


def _mark_failed(run_id: str, from_state: str, reason: str, exit_code: int | None = None) -> None:
    run_store.finalize_run(
        run_id,
        "FAILED",
        {},
        expected_state=from_state,
        exit_code=exit_code,
        failure_reason=reason,
    )


def _sync_run_log_snapshot(run_id: str, log_path: Path | None) -> None:
    if log_path is None or not log_path.exists():
        return
    run = run_store.get_run(run_id)
    if not run or not run.get("run_dir"):
        return
    run_dir = Path(run["run_dir"])
    if not run_dir.exists():
        return
    _atomic_copy(log_path, run_dir / "run.log")


def _mark_cancelled(run_id: str) -> None:
    run = run_store.get_run(run_id)
    if not run or run.get("state") in run_store.TERMINAL_STATES:
        return
    run_store.finalize_run(
        run_id,
        "CANCELLED",
        {},
        expected_state=run["state"],
        exit_code=-signal.SIGTERM,
        failure_reason="cancelled",
    )


def run_worker_v2(batch_id: str, *, no_cache: bool = False, trigger: str = "manual", invoice_path: str | None = None) -> dict[str, Any]:
    """Run a full Portal v2 lifecycle worker and return the terminal run row."""
    _install_signal_handlers()
    batch_id = _normalize_batch_id(batch_id)
    run_store.init_schema()

    created_at = run_store.utc_now()
    run_id = run_store.generate_run_id(batch_id, run_store.parse_utc(created_at))
    lock_fd: int | None = None
    log_path: Path | None = None

    lock_fd = _acquire_v1_lock(run_id)
    try:
        v1.PIPELINE_LOGS_DIR.mkdir(parents=True, exist_ok=True)
        log_path = v1.PIPELINE_LOGS_DIR / f"{created_at.replace(':', '').replace('+', 'Z')}-{run_id}.log"
        log_path.touch()

        row = run_store.insert_run(
            batch_id,
            trigger,
            run_id=run_id,
            pid=os.getpid(),
            log_path=log_path,
            created_at=created_at,
        )
        run_dir = Path(row["run_dir"])

        with log_path.open("a", encoding="utf-8", buffering=1) as log_handle:
            env_copy = os.environ.copy()
            env_copy["PYTHONUNBUFFERED"] = "1"
            failure_reason = "unknown failure"
            failure_state = "RUNNING"

            try:
                if not run_store.cas_transition(run_id, "QUEUED", "PREFLIGHT", pid=os.getpid()):
                    raise RuntimeError("could not enter PREFLIGHT")
                _set_stage(run_id, "preflight", 1, log_handle, f"[API] Starting Portal v2 lifecycle worker for {batch_id}...")

                batch_dir, raw_dir, discover_error = v1._resolve_jawal_batch_paths(batch_id)
                if discover_error:
                    failure_state = "PREFLIGHT"
                    raise RuntimeError(f"ERROR: {discover_error}")
                batch_dir = Path(batch_dir)
                raw_dir = Path(raw_dir)
                run_store.bump_heartbeat(run_id, pid=os.getpid())
                if not run_store.cas_transition(
                    run_id,
                    "PREFLIGHT",
                    "RUNNING",
                    pid=os.getpid(),
                    evidence_root=str(raw_dir),
                    log_path=str(log_path),
                    run_dir=str(run_dir),
                ):
                    raise RuntimeError("could not enter RUNNING")
                _write_log(log_handle, f"[API] discover.py resolved batch_dir={batch_dir} raw_dir={raw_dir}")

                v1._run_preflight_scan(batch_id, log_handle)
                _check_cancelled(run_id)

                if not invoice_path and batch_dir is not None:
                    staged_invoice = batch_dir / "invoice-source.xlsx"
                    if not staged_invoice.exists():
                        try:
                            xlsx_files = sorted(p for p in batch_dir.iterdir() if p.is_file() and p.suffix.lower() == ".xlsx")
                        except OSError:
                            xlsx_files = []
                        staged_invoice = xlsx_files[0] if xlsx_files else None
                    if staged_invoice and staged_invoice.exists():
                        invoice_path = str(staged_invoice)
                        _write_log(log_handle, f"[API] Auto-detected staged invoice from batch dir: {invoice_path}")

                if invoice_path:
                    upload_invoice = Path(invoice_path).expanduser().resolve(strict=False)
                    if not upload_invoice.exists():
                        raise RuntimeError(f"ERROR: uploaded invoice_path does not exist: {upload_invoice}")
                    if upload_invoice.suffix.lower() not in (".xlsx", ".xls"):
                        raise RuntimeError(f"ERROR: invoice_path must be an Excel file: {upload_invoice}")
                    _set_stage(run_id, "invoice-convert", 1, log_handle, "[API] >> PRE-STAGE: Converting uploaded Jawal invoice to pipeline input...")
                    convert_cmd = [
                        "python3",
                        "-u",
                        str(SCRIPTS / "convert_jawal_invoice.py"),
                        "--invoice-file",
                        str(upload_invoice),
                        "--batch-dir",
                        str(batch_dir),
                        "--master-data",
                        str(ROOT / "qc/master-data/Aljeel_Lookups-v2.xlsx"),
                    ]
                    code = _run_logged_command(run_id, convert_cmd, log_handle, env=env_copy)
                    if code != 0:
                        raise RuntimeError(f"Pre-stage invoice conversion failed with code {code}")
                    _write_log(log_handle, "[API] >> PRE-STAGE: Conversion complete - Spreadsheet-v4-input.xlsx ready")
                else:
                    _write_log(log_handle, "[API] No invoice_path supplied; Stage 1 will use on-disk batch input")

                _set_stage(run_id, "cascade", 2, log_handle, "[API] >> STAGE 1: Generating fresh deterministic cascade from raw excel...")
                cmd1 = ["python3", "-u", str(SCRIPTS / "process_batch.py"), "--batch", str(batch_dir), "--raw-dir", str(raw_dir), "--suffix", "v15.11.2"]
                if no_cache:
                    cmd1.append("--no-cache")
                code = _run_logged_command(run_id, cmd1, log_handle, env=env_copy)
                if code != 0:
                    raise RuntimeError(f"Stage 1 (Cascade) failed with code {code}")

                _set_stage(run_id, "v30-llm", 3, log_handle, "[API] >> STAGE 2: Running LLM Exception Handler (v30)...")
                cmd2 = ["python3", "-u", str(SCRIPTS / "run_v30.py"), batch_id, "--input-suffix", "v15.11.2"]
                code = _run_logged_command(run_id, cmd2, log_handle, env=env_copy)
                if code != 0:
                    raise RuntimeError(f"Stage 2 (LLM Pipeline) failed with code {code}")

                _set_stage(run_id, "document-parser", 4, log_handle, "[API] >> STAGE 2.5: Running AI Document Parser (Phase 1 pre-parse for fraud detector)...")
                parsed_json = ROOT / "qc" / "ai-poc" / "raw" / f"{batch_id.lower()}-ai-parsed.json"
                invoice_to_parse: Path | None = None
                candidate = batch_dir / "invoice-source.xlsx"
                if candidate.exists():
                    invoice_to_parse = candidate
                if invoice_to_parse is None and invoice_path:
                    candidate = Path(invoice_path)
                    if candidate.exists():
                        invoice_to_parse = candidate
                if invoice_to_parse is None:
                    vol_dir = v1.VOLUME_BASE / batch_id
                    if vol_dir.is_dir():
                        try:
                            candidates = [p for p in vol_dir.iterdir() if p.is_file() and p.suffix.lower() == ".xlsx" and "inv" in p.name.lower()]
                        except OSError:
                            candidates = []
                        if candidates:
                            invoice_to_parse = sorted(candidates, key=lambda p: p.name)[0]
                if invoice_to_parse is None:
                    _write_log(log_handle, "[API] WARNING: Stage 2.5 skipped - no source invoice found for Phase 1 parsing")
                else:
                    parsed_json.parent.mkdir(parents=True, exist_ok=True)
                    cmd25 = ["python3", "-u", str(ROOT / "qc" / "ai-poc" / "ai_document_parser.py"), str(invoice_to_parse), "--raw-out", str(parsed_json), "--force"]
                    code = _run_logged_command(run_id, cmd25, log_handle, env=env_copy)
                    if code != 0:
                        if parsed_json.exists():
                            raise RuntimeError("Stage 2.5 failed and stale parsed data exists - aborting to prevent stale fraud audit")
                        _write_log(log_handle, f"[API] WARNING: Stage 2.5 (Document Parser) failed with code {code}; Stage 3 may fail")
                    else:
                        _write_log(log_handle, f"[API] Stage 2.5 complete: {parsed_json.name} written")

                _set_stage(run_id, "fraud", 5, log_handle, "[API] >> STAGE 3: Running AI Consistency Check (Gemini-Pro Deep Audit)...")
                stage3_env = env_copy.copy()
                stage3_env["AI_POC_BATCHES"] = batch_id
                cmd3 = ["python3", "-u", str(ROOT / "qc" / "ai-poc" / "ai_fraud_detector.py")]
                if no_cache:
                    cmd3.append("--no-cache")
                code = _run_logged_command(run_id, cmd3, log_handle, env=stage3_env)
                if code != 0:
                    raise RuntimeError(f"Stage 3 (AI Consistency Check) failed with code {code}")

                _set_stage(run_id, "inject", 6, log_handle, "[API] >> STAGE 4: Injecting AI Consistency Check results into final spreadsheet...")
                cmd4 = ["python3", "-u", str(SCRIPTS / "inject_fraud_to_excel.py"), batch_id]
                code = _run_logged_command(run_id, cmd4, log_handle, env=env_copy)
                if code != 0:
                    raise RuntimeError(f"Stage 4 (Excel Injection) failed with code {code}")

                _set_stage(run_id, "review", 7, log_handle, "[API] >> STAGE 4.5: Rebuilding portal review JSON from v30 spreadsheet...")
                cmd45 = ["python3", "-u", str(SCRIPTS / "build_j788_review_v30.py"), "--batch", batch_id, "--raw-dir", str(raw_dir)]
                if no_cache:
                    cmd45.append("--no-cache")
                code = _run_logged_command(run_id, cmd45, log_handle, env=env_copy)
                if code != 0:
                    raise RuntimeError(f"Stage 4.5 (Portal Review JSON) failed with code {code}")
                _write_log(log_handle, "[API] Stage 4.5 complete: portal review JSON rebuilt.")

                _set_stage(run_id, "split", 8, log_handle, "[API] >> STAGE 5: Splitting multi-employee rows into separate output file...")
                output_path = batch_dir / "output" / f"Spreadsheet-{batch_id}-FILLED-v30.xlsx"
                split_output = Path(str(output_path).replace("-v30.xlsx", "-v30-SPLIT.xlsx"))
                cmd5 = ["python3", "-u", str(SCRIPTS / "split_multi_emp.py"), str(output_path), str(split_output)]
                code = _run_logged_command(run_id, cmd5, log_handle, env=env_copy)
                if code != 0:
                    raise RuntimeError(f"Stage 5 (Multi-Emp Splitter) failed with code {code}")
                _write_log(log_handle, f"[API] [STAGE 5] Split complete: {split_output.name}")

                _write_log(log_handle, "[API] Pipeline commands complete; skipping v1 Cloudflare deploy in v2 worker.")
                _finalize_success(run_id, batch_id, batch_dir, raw_dir, log_path, log_handle, env_copy)
                _write_log(log_handle, "[END]")
                _sync_run_log_snapshot(run_id, log_path)
            except RunCancelled as exc:
                _write_log(log_handle, f"[PIPELINE_CANCELLED: {exc}]")
                _mark_cancelled(run_id)
                _write_log(log_handle, "[END]")
            except Exception as exc:
                failure_reason = str(exc)
                run = run_store.get_run(run_id)
                failure_state = (run or {}).get("state") or failure_state
                if failure_state == "FINALIZING":
                    _mark_failed(run_id, "FINALIZING", failure_reason, exit_code=1)
                elif failure_state == "PREFLIGHT":
                    _mark_failed(run_id, "PREFLIGHT", failure_reason, exit_code=1)
                else:
                    _mark_failed(run_id, "RUNNING", failure_reason, exit_code=1)
                _write_log(log_handle, f"[PIPELINE_FAILED: {failure_reason}]")
                _write_log(log_handle, "[END]")
                _sync_run_log_snapshot(run_id, log_path)
    finally:
        _release_v1_lock(lock_fd)

    terminal = run_store.get_run(run_id)
    if terminal is None:
        raise RuntimeError(f"run row missing after worker exit: {run_id}")
    return terminal


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Portal v2 lifecycle worker for a Jawal batch.")
    parser.add_argument("batch_id")
    parser.add_argument("--no-cache", action="store_true")
    parser.add_argument("--trigger", choices=("manual", "rerun"), default="manual")
    args = parser.parse_args(argv)

    try:
        row = run_worker_v2(args.batch_id, no_cache=args.no_cache, trigger=args.trigger)
    except RunLockBusy as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 75

    print(json.dumps({"run_id": row["run_id"], "state": row["state"], "run_dir": row["run_dir"]}, indent=2, sort_keys=True))
    return 0 if row["state"] == "SUCCEEDED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
