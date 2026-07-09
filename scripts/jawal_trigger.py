#!/usr/bin/env python3
"""Internal fire-and-forget Jawal trigger API.

Environment:
  JAWAL_TRIGGER_KEY: shared secret required in X-Jawal-Trigger-Key.
  /usr/local/bin/gog: sends Gmail reports using service keyring auth.
  JAWAL_REPORT_RECIPIENTS: comma-separated default report recipients.
  JAWAL_EMAIL_INCLUDE_LOG: truthy values include log tails in success emails.
"""
from __future__ import annotations

import json
import logging
import os
import queue
import re
import shutil
import subprocess
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Blueprint, Response, jsonify, request

try:
    import yaml
except ImportError:
    yaml = None


ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
OPENAPI_SPEC = ROOT / "docs" / "jawal-trigger-api.openapi.yaml"
PIPELINE_TIMEOUT_SECONDS = 3 * 60 * 60
DEFAULT_RECIPIENTS = ["amr@accordpartners.ai"]
GOG_BIN = "/usr/local/bin/gog"
GOG_ACCOUNT = "aljeel@accordpartners.ai"
HOUSE_CC = "amr@accordpartners.ai"

bp = Blueprint("jawal_trigger", __name__)
_logger = logging.getLogger("jawal_trigger")

_job_queue: queue.Queue["JawalJob"] = queue.Queue()
_registry: dict[str, dict[str, Any]] = {}
_registry_lock = threading.Lock()
_worker_lock = threading.Lock()
_worker_thread: threading.Thread | None = None
_openapi_spec: dict[str, Any] | None = None
_openapi_yaml: bytes | None = None
_DOC_ID_PREFIX_RE = re.compile(r"^[a-z0-9]{16,}-")
# This registry/queue is intentionally in-memory; restarting Flask loses queued
# jobs and status history.


@dataclass(frozen=True)
class JawalJob:
    run_id: str
    batch_id: str
    invoice_path: str | None
    no_cache: bool
    recipients: list[str]
    archive_date: str | None = None
    include_log: bool = False


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_error(status: int, error: str) -> tuple[Response, int]:
    return jsonify({"error": error}), status


def _load_openapi_spec() -> tuple[dict[str, Any] | None, bytes | None]:
    global _openapi_spec, _openapi_yaml
    if _openapi_spec is not None and _openapi_yaml is not None:
        return _openapi_spec, _openapi_yaml
    if yaml is None:
        _logger.warning("Jawal OpenAPI spec unavailable: PyYAML is not installed")
        return None, None
    try:
        raw_yaml = OPENAPI_SPEC.read_bytes()
        spec = yaml.safe_load(raw_yaml)
    except OSError as exc:
        _logger.warning("Jawal OpenAPI spec unavailable: %s", exc)
        return None, None
    except yaml.YAMLError as exc:
        _logger.warning("Jawal OpenAPI spec unavailable: %s", exc)
        return None, None
    if not isinstance(spec, dict):
        _logger.warning("Jawal OpenAPI spec unavailable: expected YAML mapping")
        return None, None
    _openapi_spec = spec
    _openapi_yaml = raw_yaml
    return _openapi_spec, _openapi_yaml


def _authorized() -> bool:
    expected = os.environ.get("JAWAL_TRIGGER_KEY", "")
    return bool(expected) and request.headers.get("X-Jawal-Trigger-Key", "") == expected


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _validate_recipients(value: Any) -> list[str] | None:
    if value is None:
        return None
    if not isinstance(value, list):
        raise ValueError("recipients must be a list of email addresses")
    recipients = [_clean(item) for item in value]
    recipients = [item for item in recipients if item]
    if not recipients:
        raise ValueError("recipients must contain at least one email address")
    for item in recipients:
        if "@" not in item or any(ch.isspace() for ch in item):
            raise ValueError(f"invalid recipient: {item}")
    return recipients


def _validate_invoice_path(value: Any) -> str | None:
    if value in (None, ""):
        return None
    invoice_path = _clean(value)
    if not invoice_path:
        return None
    path = Path(invoice_path)
    if not path.is_absolute():
        raise ValueError("invoice_path must be an absolute path")
    if "/" in path.name or "\\" in path.name:
        raise ValueError("invoice_path must be a file path")
    if path.suffix.lower() not in (".xlsx", ".xls"):
        raise ValueError("invoice_path must be an Excel file")
    return str(path)


def _strip_doc_id_prefix(name: str) -> str:
    return _DOC_ID_PREFIX_RE.sub("", name, count=1)


def _atomic_copy(src: Path, dst: Path) -> None:
    dst = Path(dst)
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.parent / f".tmp-{dst.name}"
    shutil.copy2(src, tmp)
    os.replace(tmp, dst)


def _stage_jawal_portal_docs(batch_id: str, folder_name: str) -> tuple[Path, Path, str | None, int]:
    """Copy portal-staged docs into batches/jawal-<batch>/{raw,invoice-source.xlsx}."""
    normalized = batch_id.replace("jawal-", "")
    batch_dir = ROOT / "batches" / f"jawal-{normalized}"
    raw_dir = batch_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    src = Path(folder_name)
    if not src.is_dir():
        raise FileNotFoundError(f"staged folder not found: {folder_name}")

    excel_candidates: list[tuple[Path, str]] = []
    other_files: list[tuple[Path, str]] = []
    for entry in sorted(src.iterdir(), key=lambda p: p.name.lower()):
        if not entry.is_file():
            continue
        clean = _strip_doc_id_prefix(entry.name)
        if entry.suffix.lower() in (".xlsx", ".xls"):
            excel_candidates.append((entry, clean))
        else:
            other_files.append((entry, clean))

    invoice_path = None
    invoice_entry = None
    if excel_candidates:
        invoice_entry = next((i for i in excel_candidates if "inv" in i[1].lower()), excel_candidates[0])
        dst_invoice = batch_dir / "invoice-source.xlsx"
        _atomic_copy(invoice_entry[0], dst_invoice)
        invoice_path = str(dst_invoice)

    staged = 0
    for entry, clean in other_files:
        _atomic_copy(entry, raw_dir / clean)
        staged += 1
    for entry, clean in excel_candidates:
        if invoice_entry is not None and entry == invoice_entry[0]:
            continue
        _atomic_copy(entry, raw_dir / clean)
        staged += 1
    return batch_dir, raw_dir, invoice_path, staged


def _parse_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("JSON body required")

    batch_id = _clean(payload.get("batch_id")).upper()
    folder_name = _clean(payload.get("folder_name")) or None
    archive_date = payload.get("archive_date")
    recipients = _validate_recipients(payload.get("recipients"))
    invoice_path = _validate_invoice_path(payload.get("invoice_path"))
    no_cache = payload.get("no_cache", True)
    include_log = payload.get("include_log", _default_include_log())

    if not re.fullmatch(r"J26-\d+", batch_id):
        raise ValueError("batch_id must match ^J26-\\d+$")
    if "/" in batch_id or "\\" in batch_id:
        raise ValueError("batch_id must not contain path separators")
    if not isinstance(no_cache, bool):
        raise ValueError("no_cache must be a boolean")
    if not isinstance(include_log, bool):
        raise ValueError("include_log must be a boolean")

    return {
        "batch_id": batch_id,
        "folder_name": folder_name,
        "archive_date": archive_date,
        "invoice_path": invoice_path,
        "no_cache": no_cache,
        "include_log": include_log,
        "recipients": recipients or _default_recipients(),
    }


def _default_recipients() -> list[str]:
    raw = os.environ.get("JAWAL_REPORT_RECIPIENTS", "")
    recipients = [item.strip() for item in raw.split(",") if item.strip()]
    return recipients or DEFAULT_RECIPIENTS[:]


def _default_include_log() -> bool:
    return os.environ.get("JAWAL_EMAIL_INCLUDE_LOG", "").strip().lower() in {"1", "true", "yes"}


def _tail(text: str, limit: int = 4000) -> str:
    text = text or ""
    return text[-limit:]


def _email_configured() -> bool:
    return os.path.exists(GOG_BIN) and os.access(GOG_BIN, os.X_OK)


def _send_email(recipients: list[str], subject: str, body: str, attachments: list[Path] | None = None) -> bool:
    if not _email_configured():
        _logger.warning("Jawal gog mailer is not available; skipping email")
        return False

    clean_recipients = [recipient.strip() for recipient in recipients if recipient.strip()]
    recipient_keys = {recipient.lower() for recipient in clean_recipients}
    cc_recipients = [] if HOUSE_CC in recipient_keys else [HOUSE_CC]

    args = [
        GOG_BIN,
        "gmail",
        "send",
        "--account",
        GOG_ACCOUNT,
        "--to",
        ",".join(clean_recipients),
        "--subject",
        subject,
        "--body",
        body,
    ]
    if cc_recipients:
        args.extend(["--cc", ",".join(cc_recipients)])
    for attachment in attachments or []:
        args.extend(["--attach", str(attachment)])

    try:
        completed = subprocess.run(args, text=True, capture_output=True, timeout=120)
    except subprocess.TimeoutExpired as exc:
        _logger.warning("Jawal gog email timed out after %s seconds: %s", exc.timeout, exc)
        return False
    except OSError as exc:
        _logger.warning("Jawal gog email failed to start: %s", exc)
        return False

    if completed.returncode != 0:
        _logger.warning(
            "Jawal gog email failed with exit code %s; stdout=%r stderr=%r",
            completed.returncode,
            _tail(completed.stdout, 2000),
            _tail(completed.stderr, 2000),
        )
        return False
    return True


def _output_paths(batch_id: str) -> tuple[Path, Path]:
    output = ROOT / "batches" / f"jawal-{batch_id}" / "output" / f"Spreadsheet-{batch_id}-FILLED-v30.xlsx"
    split = output.with_name(output.name.replace("-v30.xlsx", "-v30-SPLIT.xlsx"))
    return output, split


def _headline_counts(batch_id: str) -> dict[str, Any]:
    review_json = ROOT / "dashboard" / "public" / "data" / f"{batch_id.lower().replace('-', '')}-rows-v30.json"
    if not review_json.exists():
        return {}
    try:
        data = json.loads(review_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    rows = data.get("rows") if isinstance(data, dict) else data
    if not isinstance(rows, list):
        return {}
    statuses: dict[str, int] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        status = _clean(row.get("status") or row.get("row_status") or row.get("reconciliation_status")).upper()
        if status:
            statuses[status] = statuses.get(status, 0) + 1
    return {"rows": len(rows), "statuses": statuses}


def _success_body(job: JawalJob, counts: dict[str, Any], log_tail: str) -> str:
    lines = [
        "Jawal generation complete.",
        "",
        f"Run ID: {job.run_id}",
        f"Batch ID: {job.batch_id}",
    ]
    if counts:
        lines.extend(["", f"Rows: {counts.get('rows', 0)}"])
        statuses = counts.get("statuses") or {}
        if statuses:
            lines.append("Statuses: " + ", ".join(f"{key}={value}" for key, value in sorted(statuses.items())))
    if log_tail:
        lines.extend(["", "Log tail:", _tail(log_tail, 1500)])
    return "\n".join(lines)


def _failure_body(job: JawalJob, detail: str) -> str:
    return "\n".join([
        "Jawal reconciliation failed.",
        "",
        f"Run ID: {job.run_id}",
        f"Batch ID: {job.batch_id}",
        "",
        "Error tail:",
        _tail(detail),
    ])


def _set_run(run_id: str, **updates: Any) -> None:
    with _registry_lock:
        if run_id in _registry:
            _registry[run_id].update(updates)


def _log_path_for(run_id: str) -> Path:
    timestamp = _utc_now().replace(":", "").replace("+", "Z")
    return ROOT / "tmp" / "pipeline-logs" / f"jawal-trigger-{timestamp}-{run_id[:8]}.log"


def _read_log_tail(log_path: Path) -> str:
    try:
        return _tail(log_path.read_text(encoding="utf-8"))
    except OSError:
        return ""


def _run_jawal_pipeline(job: JawalJob, log_path: Path, lock_fd: int) -> None:
    import droplet_api_flask

    droplet_api_flask._run_pipeline_worker(
        job.batch_id,
        job.no_cache,
        job.invoice_path,
        log_path,
        lock_fd,
    )


def _acquire_pipeline_lock(job: JawalJob, log_path: Path) -> int:
    import droplet_api_flask

    deadline = time.monotonic() + PIPELINE_TIMEOUT_SECONDS
    droplet_api_flask._maybe_clear_stale_lock()
    while True:
        try:
            lock_fd = os.open(droplet_api_flask.RUN_LOCK, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            started_at = _utc_now()
            os.write(lock_fd, f"{job.run_id[:8]}\n".encode("utf-8"))
            droplet_api_flask.RUN_LOCK_TS.write_text(
                json.dumps({"since": started_at, "run_id": job.run_id[:8]}),
                encoding="utf-8",
            )
            return lock_fd
        except FileExistsError:
            if time.monotonic() >= deadline:
                raise TimeoutError("Timed out waiting for active Jawal pipeline lock")
            with log_path.open("a", encoding="utf-8", buffering=1) as log_handle:
                droplet_api_flask._write_pipeline_log(
                    log_handle,
                    "[API] Waiting for existing Jawal pipeline run to finish...",
                )
            time.sleep(30)


def _fail_run(job: JawalJob, detail: str) -> None:
    subject = f"Jawal {job.batch_id} — FAILED"
    email_sent = _send_email(job.recipients, subject, _failure_body(job, detail), [])
    _set_run(job.run_id, status="failed", finished_at=_utc_now(), error=_tail(detail), email_sent=email_sent)


def _execute_job(job: JawalJob) -> None:
    _set_run(job.run_id, status="running", started_at=_utc_now())
    log_path = _log_path_for(job.run_id)
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.touch()

    lock_fd: int | None = None
    try:
        lock_fd = _acquire_pipeline_lock(job, log_path)
        _run_jawal_pipeline(job, log_path, lock_fd)
        lock_fd = None
    except Exception as exc:
        if lock_fd is not None:
            try:
                os.close(lock_fd)
            except OSError:
                pass
            try:
                import droplet_api_flask

                droplet_api_flask._clear_run_lock_files()
            except Exception:
                pass
        _logger.exception("Unhandled Jawal trigger failure for %s", job.run_id)
        _fail_run(job, str(exc))
        return

    log_tail = _read_log_tail(log_path)
    if "[PIPELINE_SUCCESS]" not in log_tail:
        detail = log_tail or "Jawal pipeline failed without a log tail"
        _fail_run(job, detail)
        return

    output_path, split_output = _output_paths(job.batch_id)
    if not split_output.exists():
        _fail_run(job, f"Pipeline succeeded but expected SPLIT output missing: {split_output}")
        return
    attachments = [split_output]

    counts = _headline_counts(job.batch_id)
    subject = f"Jawal {job.batch_id} — generation complete"
    success_log_tail = log_tail if job.include_log else ""
    email_sent = _send_email(job.recipients, subject, _success_body(job, counts, success_log_tail), attachments)
    _set_run(
        job.run_id,
        status="done",
        finished_at=_utc_now(),
        counts=counts,
        outputs=[str(output_path), str(split_output)],
        email_sent=email_sent,
    )


def _worker_loop() -> None:
    while True:
        job = _job_queue.get()
        try:
            _execute_job(job)
        except Exception as exc:
            _logger.exception("Unhandled Jawal trigger failure for %s", job.run_id)
            _fail_run(job, str(exc))
        finally:
            _job_queue.task_done()


def start_worker() -> threading.Thread:
    global _worker_thread
    with _worker_lock:
        if _worker_thread and _worker_thread.is_alive():
            return _worker_thread
        _worker_thread = threading.Thread(target=_worker_loop, name="jawal-trigger-worker", daemon=True)
        _worker_thread.start()
        return _worker_thread


@bp.record_once
def _start_worker_on_registration(_state: Any) -> None:
    start_worker()


@bp.route("/jawal/openapi.json", methods=["GET"])
def get_openapi_json() -> tuple[Response, int]:
    spec, _raw_yaml = _load_openapi_spec()
    if spec is None:
        return _json_error(500, "openapi spec unavailable")
    return jsonify(spec), 200


@bp.route("/jawal/openapi.yaml", methods=["GET"])
def get_openapi_yaml() -> tuple[Response, int]:
    global _openapi_yaml
    if _openapi_yaml is None:
        try:
            _openapi_yaml = OPENAPI_SPEC.read_bytes()
        except OSError as exc:
            _logger.warning("Jawal OpenAPI spec unavailable: %s", exc)
            return _json_error(500, "openapi spec unavailable")
    return Response(_openapi_yaml, mimetype="application/yaml"), 200


@bp.route("/jawal/run", methods=["POST"])
def enqueue_run() -> tuple[Response, int]:
    if not _authorized():
        return _json_error(401, "unauthorized")
    try:
        payload = _parse_payload(request.get_json(silent=True))
    except ValueError as exc:
        return _json_error(400, str(exc))

    folder_name = payload.pop("folder_name")
    if folder_name:
        explicit_invoice_path = payload.get("invoice_path")
        try:
            _batch_dir, _raw_dir, staged_invoice_path, staged_count = _stage_jawal_portal_docs(
                payload["batch_id"],
                folder_name,
            )
        except FileNotFoundError as exc:
            return _json_error(400, str(exc))
        if staged_count == 0 and staged_invoice_path is None:
            return _json_error(400, "no source documents found in folder_name")
        payload["invoice_path"] = explicit_invoice_path or staged_invoice_path

    run_id = uuid.uuid4().hex
    created_at = _utc_now()
    job = JawalJob(run_id=run_id, **payload)
    queue_position = _job_queue.qsize() + 1
    with _registry_lock:
        _registry[run_id] = {
            "run_id": run_id,
            "status": "queued",
            "batch_id": job.batch_id,
            "created_at": created_at,
            "started_at": None,
            "finished_at": None,
            "email_sent": None,
            "archive_date": job.archive_date,
        }
    _job_queue.put(job)
    return jsonify({"run_id": run_id, "status": "queued", "queue_position": queue_position}), 202


@bp.route("/jawal/run/<run_id>", methods=["GET"])
def get_run(run_id: str) -> tuple[Response, int]:
    if not _authorized():
        return _json_error(401, "unauthorized")
    with _registry_lock:
        run = dict(_registry.get(run_id) or {})
    if not run:
        return _json_error(404, "not found")
    return jsonify(run), 200
