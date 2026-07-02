#!/usr/bin/env python3
"""Portal v2 Flask blueprint for persistent run-state APIs."""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
import shutil
import signal
import subprocess
import sys
import threading
import time
from collections import Counter
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from flask import Blueprint, Response, jsonify, request, send_file

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

import run_store  # noqa: E402
import build_inconsistencies_report as report_builder  # noqa: E402

_main_module = sys.modules.get("__main__")
if _main_module is not None and all(hasattr(_main_module, name) for name in ("RUN_LOCK", "_read_lock_status", "_batch_sort_key")):
    v1 = _main_module
else:
    import droplet_api_flask as v1  # noqa: E402


bp = Blueprint("portal_v2", __name__, url_prefix="/v2")

ACCESS_EMAIL_HEADER = "Cf-Access-Authenticated-User-Email"
# Cloudflare strips client-supplied Cf-* headers at the tunnel edge, so the
# Cf-Access header above is deleted before it reaches Flask when the Pages
# worker proxies to the tunnel hostname. The worker therefore re-sends the
# resolved identity under a non-Cf header (survives the edge), guarded by a
# shared secret because the tunnel hostname is not itself Access-gated.
PROXY_EMAIL_HEADER = "X-V2-User-Email"
PROXY_SECRET_HEADER = "X-V2-Proxy-Secret"
V2_PROXY_SECRET = os.environ.get("V2_PROXY_SECRET", "").strip()

_logger = logging.getLogger("portal_v2")

TERMINAL_STATES = run_store.TERMINAL_STATES
ACTIVE_STATES = {"QUEUED", *run_store.ACTIVE_STATES}
MAX_LOG_BYTES = 256 * 1024
REAPER_INTERVAL_SECONDS = 60
EVIDENCE_TREE_MAX_DEPTH = 8
EVIDENCE_TREE_MAX_NODES = 5000

_reaper_thread: threading.Thread | None = None
_reaper_stop = threading.Event()
_reaper_lock = threading.Lock()


def _json_error(status: int, error: str, **extra: Any) -> tuple[Response, int]:
    payload: dict[str, Any] = {"error": error}
    payload.update(extra)
    return jsonify(payload), status


def _run_reaper_once() -> list[str]:
    reaped = run_store.reap_abandoned()
    if reaped:
        lock_status = v1._read_lock_status()
        if lock_status.get("run_id") in reaped:
            v1._clear_run_lock_files()
    return reaped


def _reaper_loop() -> None:
    while not _reaper_stop.wait(REAPER_INTERVAL_SECONDS):
        try:
            _run_reaper_once()
        except Exception:
            continue


def start_reaper_timer() -> threading.Thread:
    global _reaper_thread
    with _reaper_lock:
        if _reaper_thread and _reaper_thread.is_alive():
            return _reaper_thread
        _reaper_stop.clear()
        _reaper_thread = threading.Thread(target=_reaper_loop, name="portal-v2-run-reaper", daemon=True)
        _reaper_thread.start()
        return _reaper_thread


@bp.record_once
def _start_reaper_on_registration(_state: Any) -> None:
    start_reaper_timer()


def _request_email() -> str | None:
    """Resolve the authenticated reviewer email from the trusted Pages worker.

    Identity arrives via one of two headers, both set only by our worker after
    it has cryptographically verified the Cloudflare Access JWT:

      * ``Cf-Access-Authenticated-User-Email`` — present only when Access itself
        injected it. Cloudflare strips any client-supplied Cf-* header at its
        edge, so a value reaching us here cannot have been spoofed: trusted as-is.
      * ``X-V2-User-Email`` — the worker re-sends identity under this non-Cf name
        because CF deletes the Cf-Access header on the tunnel hop. This name is
        NOT stripped, so it would be forgeable by anyone who can reach the
        (un-gated) tunnel hostname directly. We therefore trust it only when the
        shared ``X-V2-Proxy-Secret`` matches the configured secret. If no secret
        is configured in this environment we still accept it (so the portal is
        not blocked) but log a warning.
    """
    cf_email = (request.headers.get(ACCESS_EMAIL_HEADER) or "").strip()
    if cf_email:
        return cf_email
    proxy_email = (request.headers.get(PROXY_EMAIL_HEADER) or "").strip()
    if not proxy_email:
        return None
    if V2_PROXY_SECRET:
        if request.headers.get(PROXY_SECRET_HEADER, "") == V2_PROXY_SECRET:
            return proxy_email
        # Secret is configured but the request did not present a matching one —
        # treat the spoofable header as absent.
        _logger.warning("v2 proxy: X-V2-User-Email rejected — proxy secret mismatch")
        return None
    # No secret configured: accept to avoid blocking, but make the gap visible.
    _logger.warning(
        "v2 proxy: trusting X-V2-User-Email WITHOUT a shared secret "
        "(set V2_PROXY_SECRET in the Flask env to harden)"
    )
    return proxy_email


@bp.before_request
def _require_access_header() -> tuple[Response, int] | None:
    if not _request_email():
        return _json_error(401, "access_header_required")
    return None


def _parse_artifacts(run: dict[str, Any]) -> dict[str, Any]:
    raw = run.get("artifacts_json")
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _run_dir(run: dict[str, Any]) -> Path | None:
    if not run.get("run_dir"):
        return None
    return Path(run["run_dir"]).resolve(strict=False)


def _artifact_path(run: dict[str, Any], rel: str | None) -> Path | None:
    run_dir = _run_dir(run)
    if not run_dir or not rel:
        return None
    path = (run_dir / rel).resolve(strict=False)
    if not path.is_relative_to(run_dir):
        return None
    return path


def _evidence_root(run: dict[str, Any]) -> Path | None:
    if not run.get("evidence_root"):
        return None
    return Path(run["evidence_root"]).resolve(strict=False)


def _resolve_evidence_rel(run: dict[str, Any], rel: str | None) -> tuple[Path | None, Path | None]:
    root = _evidence_root(run)
    return _resolve_evidence_path(root, rel)


def _resolve_evidence_path(root: Path | None, rel: str | None) -> tuple[Path | None, Path | None]:
    if root is None or rel is None:
        return root, None
    root = root.resolve(strict=False)
    rel = rel.strip()
    rel = unquote(rel)
    if not rel or rel in {".", "/"}:
        return root, None
    if "\x00" in rel or Path(rel).is_absolute():
        return root, None
    try:
        path = (root / rel).resolve(strict=False)
    except (OSError, ValueError):
        return root, None
    if not path.is_relative_to(root):
        return root, None
    return root, path


def _evidence_file_kind(path: Path) -> str:
    ext = path.suffix.lower()
    if ext == ".pdf":
        return "pdf"
    if ext in {".msg", ".eml"}:
        return "email"
    if ext in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}:
        return "image"
    return "other"


def _is_internal_evidence_file(path: Path) -> bool:
    return path.name == ".evidence_text_index.json" or path.name.startswith(".evidence_text_index")


def _evidence_node(path: Path, root: Path, *, is_dir: bool) -> dict[str, Any]:
    rel = "" if path == root else path.relative_to(root).as_posix()
    node: dict[str, Any] = {
        "name": path.name or root.name,
        "rel": rel,
        "path": rel,
        "type": "dir" if is_dir else "file",
    }
    if not is_dir:
        try:
            size = path.stat().st_size
        except OSError:
            size = 0
        node.update(
            {
                "size": size,
                "ext": path.suffix.lower(),
                "kind": _evidence_file_kind(path),
            }
        )
    return node


def _build_evidence_tree(
    root: Path,
    start: Path,
    *,
    max_depth: int = EVIDENCE_TREE_MAX_DEPTH,
    max_nodes: int = EVIDENCE_TREE_MAX_NODES,
) -> dict[str, Any]:
    root = root.resolve(strict=False)
    start = start.resolve(strict=False)
    counts = {"nodes": 0, "dirs": 0, "files": 0}
    truncated = False

    def build(path: Path, depth: int) -> dict[str, Any] | None:
        nonlocal truncated
        if counts["nodes"] >= max_nodes:
            truncated = True
            return None
        try:
            resolved = path.resolve(strict=False)
        except (OSError, ValueError):
            return None
        if not resolved.is_relative_to(root):
            return None

        is_dir = resolved.is_dir()
        is_file = resolved.is_file()
        if not is_dir and not is_file:
            return None

        counts["nodes"] += 1
        counts["dirs" if is_dir else "files"] += 1
        node = _evidence_node(resolved, root, is_dir=is_dir)
        if not is_dir:
            return node
        if depth >= max_depth:
            node["children"] = []
            node["truncated"] = True
            truncated = True
            return node

        try:
            entries = list(resolved.iterdir())
        except OSError:
            node["children"] = []
            return node

        children: list[dict[str, Any]] = []
        visible_entries = [entry for entry in entries if not _is_internal_evidence_file(entry)]
        for child in sorted(visible_entries, key=lambda item: (not item.is_dir(), item.name.lower())):
            child_node = build(child, depth + 1)
            if child_node is not None:
                children.append(child_node)
            if counts["nodes"] >= max_nodes:
                truncated = True
                break
        node["children"] = children
        return node

    tree = build(start, 0)
    if tree is None:
        tree = _evidence_node(start, root, is_dir=start.is_dir())

    return {
        "evidence_root": root.as_posix(),
        "path": "" if start == root else start.relative_to(root).as_posix(),
        "max_depth": max_depth,
        "max_nodes": max_nodes,
        "node_count": counts["nodes"],
        "dir_count": counts["dirs"],
        "file_count": counts["files"],
        "truncated": truncated,
        "tree": tree,
    }


def _serve_evidence_file(root: Path | None, rel: str | None) -> tuple[Response, int] | Response:
    _root, file_path = _resolve_evidence_path(root, rel)
    if file_path is None:
        return _json_error(400, "invalid_path")
    if not file_path.exists() or not file_path.is_file():
        return _json_error(404, "file_not_found")

    ext = file_path.suffix.lower()
    if ext == ".msg":
        return jsonify(v1._parse_msg_payload(file_path))
    if ext == ".eml":
        return jsonify(v1._parse_eml_payload(file_path))

    mimetype = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
    return send_file(file_path, mimetype=mimetype, as_attachment=False)


def _serve_evidence_msg(root: Path | None, rel: str | None) -> tuple[Response, int] | Response:
    _root, file_path = _resolve_evidence_path(root, rel)
    if file_path is None:
        return _json_error(400, "invalid_path")
    if not file_path.exists() or not file_path.is_file():
        return _json_error(404, "file_not_found")

    ext = file_path.suffix.lower()
    if ext == ".msg":
        return jsonify(v1._parse_msg_payload(file_path))
    if ext == ".eml":
        return jsonify(v1._parse_eml_payload(file_path))
    return _json_error(400, "not_an_email_file")


def _batch_evidence_root(batch_id: str) -> Path | None:
    normalized = batch_id.upper()
    root = v1._resolve_volume_evidence_root(normalized)
    if root is not None:
        return Path(root).resolve(strict=False)
    candidates = sorted(v1._batch_evidence_candidates(normalized), key=v1._evidence_candidate_sort_key)
    if not candidates:
        return None
    return Path(candidates[0][3]).resolve(strict=False)


def _load_manifest(run: dict[str, Any]) -> dict[str, Any]:
    path = _artifact_path(run, "manifest.json")
    if path and path.is_file():
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                return payload
        except (OSError, json.JSONDecodeError):
            pass
    return _parse_artifacts(run)


def _write_manifest_and_row(run: dict[str, Any], artifacts: dict[str, Any], report_payload: dict[str, Any]) -> None:
    run_dir = _run_dir(run)
    if run_dir is None:
        raise RuntimeError("run has no run_dir")
    manifest_path = run_dir / "manifest.json"
    tmp_path = run_dir / f".tmp-{manifest_path.name}"
    tmp_path.write_text(json.dumps(artifacts, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp_path, manifest_path)

    kpis = report_payload.get("kpis", {})
    with run_store.connect() as conn:
        conn.execute(
            """
            UPDATE runs
            SET artifacts_json = ?,
                flagged_rows = ?,
                sar_at_risk = ?,
                gl_cells_total = ?,
                gl_cells_filled = ?,
                gl_cells_blank = ?,
                coverage_pct = ?,
                hard_count = ?
            WHERE run_id = ?
            """,
            (
                json.dumps(artifacts, sort_keys=True),
                kpis.get("flagged_rows"),
                kpis.get("sar_at_risk"),
                kpis.get("gl_cells_total"),
                kpis.get("gl_cells_filled"),
                kpis.get("gl_cells_blank"),
                kpis.get("coverage_pct"),
                kpis.get("hard_count"),
                run["run_id"],
            ),
        )


def _report_payload_cache_path(run: dict[str, Any]) -> Path | None:
    return _artifact_path(run, "report-payload.json")


def _build_report_payload(run: dict[str, Any]) -> dict[str, Any]:
    batch_id = run["batch_id"]
    _batch_dir, output_dir = report_builder.resolve_paths(batch_id)
    summary = report_builder.load_json(output_dir / "summary-v15.11.2.json", {})
    context_by_sl = report_builder.load_row_context(output_dir, batch_id)
    fraud_rows = report_builder.load_fraud_watch(output_dir)
    catches = report_builder.load_all_catches(output_dir)
    rows = report_builder.expand_with_context(catches, context_by_sl)
    hard_rows = report_builder.hard_inconsistency_rows(rows)

    fraud_count_rows = [{"category": row.get("category", ""), "severity": row.get("severity", "")} for row in fraud_rows]
    category_count = report_builder.category_counts(rows, fraud_count_rows)
    severity_count = report_builder.severity_counts(rows, fraud_count_rows)
    flagged_rows, sar_at_risk = report_builder.unique_flagged_amount_total(rows)
    coverage = report_builder.gl_allocation_coverage(context_by_sl.values())
    sorted_rows = sorted(rows, key=report_builder.severity_sort_key)

    return {
        "run_id": run["run_id"],
        "batch_id": batch_id,
        "label": "Risk & Inconsistencies",
        "generated_at": run_store.utc_now(),
        "kpis": {
            "flagged_rows": flagged_rows,
            "sar_at_risk": round(sar_at_risk, 2),
            **coverage,
            "hard_count": len(hard_rows),
            "fraud_catches": len(fraud_rows),
        },
        "categories": dict(category_count.most_common()),
        "severity_counts": {severity: severity_count.get(severity, 0) for severity in report_builder.SEVERITY_ORDER},
        "rows": sorted_rows,
        "summary": summary if isinstance(summary, dict) else {},
    }


def _cached_report_payload(run: dict[str, Any]) -> dict[str, Any] | None:
    path = _report_payload_cache_path(run)
    if not path or not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _write_report_payload(run: dict[str, Any], payload: dict[str, Any]) -> None:
    path = _report_payload_cache_path(run)
    if path is None:
        raise RuntimeError("run has no run_dir")
    tmp_path = path.with_name(f".tmp-{path.name}")
    tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp_path, path)


def _copy_report_artifacts_to_run(run: dict[str, Any]) -> dict[str, Any]:
    batch_id = run["batch_id"]
    run_dir = _run_dir(run)
    if run_dir is None:
        raise RuntimeError("run has no run_dir")
    _batch_dir, output_dir = report_builder.resolve_paths(batch_id)
    xlsx_src = output_dir / f"Inconsistencies-Report-{batch_id}.xlsx"
    md_src = output_dir / f"Inconsistencies-Report-{batch_id}.md"
    if not xlsx_src.is_file() or not md_src.is_file():
        raise FileNotFoundError("report artifacts were not generated")
    xlsx_dst = run_dir / xlsx_src.name
    md_dst = run_dir / md_src.name
    v1._atomic_copy(xlsx_src, xlsx_dst)
    v1._atomic_copy(md_src, md_dst)
    _normalize_report_download_labels(xlsx_dst)
    _normalize_report_download_labels(md_dst)
    return {
        "xlsx": xlsx_dst.relative_to(run_dir).as_posix(),
        "md": md_dst.relative_to(run_dir).as_posix(),
        "generated_at": run_store.utc_now(),
    }


def _normalize_report_download_labels(path: Path) -> None:
    if path.suffix.lower() == ".md":
        try:
            text = path.read_text(encoding="utf-8")
        except OSError:
            return
        normalized = (
            text.replace("Inconsistencies & Fraud-Watch Report", "Risk & Inconsistencies Report")
            .replace("Fraud-Watch Headline", "Risk & Inconsistencies Headline")
            .replace("Fraud-watch catches", "Risk catches")
            .replace("Fraud-Watch", "Risk & Inconsistencies")
            .replace("Fraud-watch", "Risk & Inconsistencies")
        )
        if normalized != text:
            path.write_text(normalized, encoding="utf-8")
        return
    if path.suffix.lower() == ".xlsx":
        try:
            import openpyxl

            workbook = openpyxl.load_workbook(path)
            if "Fraud Watch" in workbook.sheetnames:
                workbook["Fraud Watch"].title = "Risk Catches"
                workbook.save(path)
        except Exception:
            return


def _duration_sec(run: dict[str, Any]) -> float | None:
    start = run_store.parse_utc(run.get("started_at") or run.get("created_at"))
    end = run_store.parse_utc(run.get("ended_at"))
    if not start:
        return None
    if not end:
        end = datetime.now(timezone.utc)
    return round((end - start).total_seconds(), 1)


def _summarize_last_run(run: dict[str, Any] | None) -> dict[str, Any] | None:
    if not run:
        return None
    return {
        "run_id": run["run_id"],
        "state": run["state"],
        "ended_at": run.get("ended_at"),
        "flagged_rows": run.get("flagged_rows"),
        "sar_at_risk": run.get("sar_at_risk"),
        "gl_cells_total": run.get("gl_cells_total"),
        "gl_cells_filled": run.get("gl_cells_filled"),
        "gl_cells_blank": run.get("gl_cells_blank"),
        "coverage_pct": run.get("coverage_pct"),
    }


def _history_row(run: dict[str, Any]) -> dict[str, Any]:
    artifacts = _parse_artifacts(run)
    return {
        "run_id": run["run_id"],
        "state": run["state"],
        "trigger": run["trigger"],
        "created_at": run.get("created_at"),
        "started_at": run.get("started_at"),
        "ended_at": run.get("ended_at"),
        "duration_sec": _duration_sec(run),
        "total_rows": run.get("total_rows"),
        "flagged_rows": run.get("flagged_rows"),
        "sar_at_risk": run.get("sar_at_risk"),
        "gl_cells_total": run.get("gl_cells_total"),
        "gl_cells_filled": run.get("gl_cells_filled"),
        "gl_cells_blank": run.get("gl_cells_blank"),
        "coverage_pct": run.get("coverage_pct"),
        "hard_count": run.get("hard_count"),
        "has_report": bool(artifacts.get("report")),
        "has_split": bool(artifacts.get("split")),
    }


def _run_payload(run: dict[str, Any]) -> dict[str, Any]:
    artifacts = _parse_artifacts(run)
    return {
        "run_id": run["run_id"],
        "batch_id": run["batch_id"],
        "state": run["state"],
        "trigger": run["trigger"],
        "stage": run.get("stage"),
        "stage_index": run.get("stage_index"),
        "stage_total": run.get("stage_total"),
        "created_at": run.get("created_at"),
        "started_at": run.get("started_at"),
        "ended_at": run.get("ended_at"),
        "heartbeat_at": run.get("heartbeat_at"),
        "stalled": run_store.is_stalled(run),
        "duration_sec": _duration_sec(run),
        "summary": {
            "total_rows": run.get("total_rows"),
            "flagged_rows": run.get("flagged_rows"),
            "sar_at_risk": run.get("sar_at_risk"),
            "gl_cells_total": run.get("gl_cells_total"),
            "gl_cells_filled": run.get("gl_cells_filled"),
            "gl_cells_blank": run.get("gl_cells_blank"),
            "coverage_pct": run.get("coverage_pct"),
            "hard_count": run.get("hard_count"),
        },
        "artifacts": {
            "split": artifacts.get("split"),
            "report": artifacts.get("report"),
            "summary": artifacts.get("summary"),
            "evidence_snapshot": artifacts.get("evidence_snapshot"),
        },
        "failure_reason": run.get("failure_reason"),
    }


def _normalize_batch_id(batch_id: str) -> str:
    return v1._normalize_batch_id(batch_id)


def _discover_batches() -> list[dict[str, Any]]:
    batches_dir = v1.ROOT / "batches"
    batch_candidates: dict[str, dict[str, Any]] = {}
    deadline = time.monotonic() + 5

    def remember_batch(batch_id: str, evidence_dir: Path, source: str) -> None:
        if source != "volume" and batch_id in batch_candidates:
            return
        batch_candidates[batch_id] = {"evidence_dir": evidence_dir, "source": source}

    try:
        volume_entries = list(os.scandir(v1.VOLUME_BASE))
    except FileNotFoundError:
        volume_entries = []

    for entry in volume_entries:
        if not entry.is_dir(follow_symlinks=False):
            continue
        if not re.match(r"^J26-\d+$", entry.name, re.IGNORECASE):
            continue
        batch_id = entry.name.upper()
        evidence_dir = v1._resolve_volume_evidence_root(batch_id)
        if evidence_dir is not None:
            remember_batch(batch_id, evidence_dir, "volume")

    try:
        batch_entries = list(os.scandir(batches_dir))
    except FileNotFoundError:
        batch_entries = []

    for entry in batch_entries:
        if not entry.is_dir(follow_symlinks=False):
            continue
        match = re.match(r"^jawal-(J26-\d+)$", entry.name, re.IGNORECASE)
        if not match:
            continue
        batch_id = match.group(1).upper()
        if batch_id in batch_candidates:
            continue
        candidates = sorted(v1._batch_evidence_candidates(batch_id), key=v1._evidence_candidate_sort_key)
        if candidates:
            remember_batch(batch_id, candidates[0][3], "batches")

    results: list[dict[str, Any]] = []
    for batch_id, candidate in batch_candidates.items():
        evidence_dir = Path(candidate["evidence_dir"])
        item_count = 0
        if time.monotonic() <= deadline:
            try:
                _size_bytes, item_count = v1._scan_size_and_count(evidence_dir, deadline)
            except TimeoutError:
                item_count = 0

        history = run_store.history(batch_id, limit=1)
        results.append(
            {
                "batch_id": batch_id,
                "evidence_root": evidence_dir.as_posix(),
                "item_count": item_count,
                "last_run": _summarize_last_run(history[0] if history else None),
            }
        )

    results.sort(key=lambda item: (v1._batch_sort_key(item["batch_id"]), item["batch_id"]), reverse=True)
    return results


def _active_lock_status() -> dict[str, Any]:
    status = v1._read_lock_status()
    if status.get("locked") and v1._maybe_clear_stale_lock(status):
        return {"locked": False, "run_id": None, "since": None}
    return status


def _latest_run_for_batch_after(
    batch_id: str,
    started_after: float,
    *,
    exclude_run_ids: set[str] | None = None,
) -> dict[str, Any] | None:
    exclude_run_ids = exclude_run_ids or set()
    for run in run_store.history(batch_id, limit=10):
        if run["run_id"] in exclude_run_ids:
            continue
        created = run_store.parse_utc(run.get("created_at"))
        if not created:
            continue
        if created.timestamp() >= started_after - 2:
            return run
    return None


def _spawn_worker(batch_id: str, *, no_cache: bool, trigger: str, invoice_path: str | None = None) -> subprocess.Popen[str]:
    worker_code = """
import json
import sys
sys.path.insert(0, 'scripts')
import run_worker_v2

batch_id = sys.argv[1]
trigger = sys.argv[2]
no_cache = sys.argv[3] == '1'
invoice_path = sys.argv[4] or None

try:
    row = run_worker_v2.run_worker_v2(batch_id, no_cache=no_cache, trigger=trigger, invoice_path=invoice_path)
except run_worker_v2.RunLockBusy as exc:
    print(f"ERROR: {exc}", file=sys.stderr)
    raise SystemExit(75)

print(json.dumps({"run_id": row["run_id"], "state": row["state"], "run_dir": row["run_dir"]}, sort_keys=True))
raise SystemExit(0 if row["state"] == "SUCCEEDED" else 1)
"""
    cmd = [
        "python3",
        "-u",
        "-c",
        worker_code,
        batch_id,
        trigger,
        "1" if no_cache else "0",
        invoice_path or "",
    ]
    log_dir = v1.PIPELINE_LOGS_DIR
    log_dir.mkdir(parents=True, exist_ok=True)
    api_log = log_dir / "portal-v2-worker-spawn.log"
    log_handle = api_log.open("ab", buffering=0)
    try:
        return subprocess.Popen(
            cmd,
            cwd=str(ROOT),
            stdin=subprocess.DEVNULL,
            stdout=log_handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )
    finally:
        log_handle.close()


@bp.get("/ping")
def ping() -> Response:
    return jsonify({"ok": True})


@bp.get("/batches")
def batches() -> Response:
    run_store.init_schema()
    return jsonify({"batches": _discover_batches()})


@bp.get("/batches/<batch_id>/runs")
def batch_runs(batch_id: str) -> Response:
    limit = request.args.get("limit", "50")
    try:
        parsed_limit = max(1, min(200, int(limit)))
    except ValueError:
        return _json_error(400, "invalid_limit")
    normalized = _normalize_batch_id(batch_id)
    return jsonify({"batch_id": normalized, "runs": [_history_row(run) for run in run_store.history(normalized, limit=parsed_limit)]})


@bp.post("/batches/<batch_id>/runs")
def trigger_run(batch_id: str) -> tuple[Response, int] | Response:
    normalized = _normalize_batch_id(batch_id)
    body = request.get_json(silent=True) or {}
    if not isinstance(body, dict):
        return _json_error(400, "invalid_json")
    trigger = body.get("trigger") or "manual"
    if trigger not in {"manual", "rerun"}:
        return _json_error(400, "invalid_trigger")
    no_cache = bool(body.get("no_cache", False))

    status = _active_lock_status()
    if status.get("locked"):
        return _json_error(409, "run_in_progress", active_run_id=status.get("run_id"))

    before_run_ids = {run["run_id"] for run in run_store.history(normalized, limit=10)}
    started_after = time.time()
    invoice_path = body.get("invoice_path")
    if invoice_path is not None and not isinstance(invoice_path, str):
        return _json_error(400, "invalid_invoice_path")

    proc = _spawn_worker(normalized, no_cache=no_cache, trigger=trigger, invoice_path=invoice_path)
    deadline = time.monotonic() + 5
    row: dict[str, Any] | None = None
    while time.monotonic() < deadline:
        row = _latest_run_for_batch_after(normalized, started_after, exclude_run_ids=before_run_ids)
        if row:
            break
        if proc.poll() is not None:
            break
        time.sleep(0.1)

    if not row:
        lock_status = _active_lock_status()
        if lock_status.get("locked") and lock_status.get("run_id"):
            for _ in range(20):
                candidate = run_store.get_run(lock_status["run_id"])
                if candidate:
                    row = candidate
                    break
                time.sleep(0.1)
        if not row:
            return _json_error(500, "worker_did_not_queue")

    run_store.prune_artifacts(normalized)
    return jsonify({"run_id": row["run_id"], "state": "QUEUED"}), 202


@bp.get("/runs/<run_id>")
def get_run(run_id: str) -> tuple[Response, int] | Response:
    run = run_store.get_run(run_id)
    if not run:
        return _json_error(404, "run_not_found")
    return jsonify(_run_payload(run))


@bp.get("/runs/<run_id>/download")
def download_split(run_id: str) -> tuple[Response, int] | Response:
    run = run_store.get_run(run_id)
    if not run:
        return _json_error(404, "run_not_found")
    split = _parse_artifacts(run).get("split")
    if not split or not split.get("rel") or not run.get("run_dir"):
        return _json_error(404, "no_split_artifact")
    run_dir = Path(run["run_dir"]).resolve(strict=False)
    path = (run_dir / split["rel"]).resolve(strict=False)
    if not path.is_relative_to(run_dir) or not path.is_file():
        return _json_error(404, "no_split_artifact")
    return send_file(path, as_attachment=True, download_name=split.get("name") or path.name)


@bp.get("/runs/<run_id>/evidence/tree")
def evidence_tree(run_id: str) -> tuple[Response, int] | Response:
    run = run_store.get_run(run_id)
    if not run:
        return _json_error(404, "run_not_found")
    artifacts = _parse_artifacts(run)
    snapshot = artifacts.get("evidence_snapshot") if isinstance(artifacts.get("evidence_snapshot"), dict) else {}
    tree_path = _artifact_path(run, snapshot.get("rel") or "evidence-tree.json")
    if not tree_path or not tree_path.is_file():
        return _json_error(404, "evidence_tree_not_found")
    try:
        payload = json.loads(tree_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _json_error(500, "invalid_evidence_tree")
    if not isinstance(payload, dict):
        return _json_error(500, "invalid_evidence_tree")
    payload.setdefault("run_id", run_id)
    payload.setdefault("batch_id", run.get("batch_id"))
    return jsonify(payload)


@bp.get("/runs/<run_id>/evidence/file")
def evidence_file(run_id: str) -> tuple[Response, int] | Response:
    run = run_store.get_run(run_id)
    if not run:
        return _json_error(404, "run_not_found")
    rel = request.args.get("rel")
    return _serve_evidence_file(_evidence_root(run), rel)


@bp.get("/batches/<batch_id>/evidence/tree")
def batch_evidence_tree(batch_id: str) -> tuple[Response, int] | Response:
    root = _batch_evidence_root(batch_id)
    if root is None or not root.exists() or not root.is_dir():
        return _json_error(404, "evidence_root_not_found")

    rel = request.args.get("path")
    if rel is None or not rel.strip() or rel.strip() in {".", "/"}:
        start = root
    else:
        _root, start = _resolve_evidence_path(root, rel)
        if start is None:
            return _json_error(400, "invalid_path")
    if not start.exists() or not start.is_dir():
        return _json_error(404, "directory_not_found")

    try:
        max_depth = int(request.args.get("depth", str(EVIDENCE_TREE_MAX_DEPTH)))
    except ValueError:
        return _json_error(400, "invalid_depth")
    max_depth = max(0, min(max_depth, EVIDENCE_TREE_MAX_DEPTH))

    payload = _build_evidence_tree(root, start, max_depth=max_depth)
    payload["batch_id"] = batch_id.upper()
    return jsonify(payload)


@bp.get("/batches/<batch_id>/evidence/file")
def batch_evidence_file(batch_id: str) -> tuple[Response, int] | Response:
    root = _batch_evidence_root(batch_id)
    if root is None or not root.exists() or not root.is_dir():
        return _json_error(404, "evidence_root_not_found")
    return _serve_evidence_file(root, request.args.get("path"))


@bp.get("/batches/<batch_id>/evidence/msg")
def batch_evidence_msg(batch_id: str) -> tuple[Response, int] | Response:
    root = _batch_evidence_root(batch_id)
    if root is None or not root.exists() or not root.is_dir():
        return _json_error(404, "evidence_root_not_found")
    return _serve_evidence_msg(root, request.args.get("path"))


@bp.get("/runs/<run_id>/evidence/msg-attachment")
def evidence_msg_attachment(run_id: str) -> tuple[Response, int] | Response:
    run = run_store.get_run(run_id)
    if not run:
        return _json_error(404, "run_not_found")
    try:
        attachment_index = int(request.args.get("attachment", "0"))
    except ValueError:
        return _json_error(400, "invalid_attachment_index")
    rel = request.args.get("rel")
    _root, file_path = _resolve_evidence_rel(run, rel)
    if file_path is None:
        return _json_error(400, "invalid_path")
    if not file_path.exists() or not file_path.is_file():
        return _json_error(404, "file_not_found")
    if file_path.suffix.lower() != ".msg":
        return _json_error(400, "not_a_msg_file")

    attachment = v1._msg_attachment(file_path, attachment_index)
    if attachment is None:
        return _json_error(404, "attachment_not_found")
    name, data = attachment
    mimetype = mimetypes.guess_type(name)[0] or "application/octet-stream"
    return send_file(BytesIO(data), mimetype=mimetype, as_attachment=False, download_name=name)


@bp.get("/runs/<run_id>/report")
def get_report(run_id: str) -> tuple[Response, int] | Response:
    run = run_store.get_run(run_id)
    if not run:
        return _json_error(404, "run_not_found")
    fmt = request.args.get("format", "json").strip().lower()
    if fmt == "json":
        payload = _cached_report_payload(run)
        if payload is None:
            try:
                payload = _build_report_payload(run)
                _write_report_payload(run, payload)
            except Exception as exc:
                return _json_error(500, "report_payload_unavailable", detail=str(exc))
        return jsonify(payload)
    if fmt not in {"xlsx", "md"}:
        return _json_error(400, "invalid_format")

    artifacts = _parse_artifacts(run)
    report = artifacts.get("report") if isinstance(artifacts.get("report"), dict) else {}
    path = _artifact_path(run, report.get(fmt))
    if not path or not path.is_file():
        return _json_error(404, "report_not_found")
    _normalize_report_download_labels(path)
    mimetype = "text/markdown" if fmt == "md" else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return send_file(path, mimetype=mimetype, as_attachment=True, download_name=path.name)


@bp.post("/runs/<run_id>/report")
def generate_report(run_id: str) -> tuple[Response, int] | Response:
    run = run_store.get_run(run_id)
    if not run:
        return _json_error(404, "run_not_found")
    if not _run_dir(run):
        return _json_error(404, "run_dir_not_found")

    cmd = ["python3", "-u", str(SCRIPTS / "build_inconsistencies_report.py"), run["batch_id"]]
    proc = subprocess.run(cmd, cwd=str(ROOT), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=300)
    if proc.returncode != 0:
        return _json_error(500, "report_generation_failed", output=proc.stdout[-4000:])

    try:
        report_manifest = _copy_report_artifacts_to_run(run)
        payload = _build_report_payload(run)
        payload["generated_at"] = report_manifest["generated_at"]
        _write_report_payload(run, payload)
    except Exception as exc:
        return _json_error(500, "report_snapshot_failed", detail=str(exc))

    artifacts = _load_manifest(run)
    artifacts["report"] = report_manifest
    artifacts["report_payload"] = {"rel": "report-payload.json", "generated_at": report_manifest["generated_at"]}
    _write_manifest_and_row(run, artifacts, payload)
    return jsonify({"run_id": run_id, "state": "ready", "generated_at": report_manifest["generated_at"]})


def _log_path_for_run(run: dict[str, Any]) -> Path | None:
    artifacts = _parse_artifacts(run)
    if run.get("run_dir") and artifacts.get("log", {}).get("rel"):
        run_dir = Path(run["run_dir"]).resolve(strict=False)
        path = (run_dir / artifacts["log"]["rel"]).resolve(strict=False)
        if path.is_relative_to(run_dir) and path.is_file():
            return path
    if run.get("log_path"):
        path = Path(run["log_path"])
        if path.is_file():
            return path
    if run.get("run_dir"):
        path = Path(run["run_dir"]) / "run.log"
        if path.is_file():
            return path
    return None


@bp.get("/runs/<run_id>/log")
def run_log(run_id: str) -> tuple[Response, int] | Response:
    run = run_store.get_run(run_id)
    if not run:
        return _json_error(404, "run_not_found")
    try:
        offset = max(0, int(request.args.get("offset", "0")))
    except ValueError:
        return _json_error(400, "invalid_offset")

    path = _log_path_for_run(run)
    if not path:
        return jsonify({"run_id": run_id, "offset": offset, "next_offset": offset, "eof": True, "lines": []})

    size = path.stat().st_size
    start = min(offset, size)
    with path.open("rb") as handle:
        handle.seek(start)
        data = handle.read(MAX_LOG_BYTES)
        next_offset = handle.tell()

    text = data.decode("utf-8", errors="replace")
    lines = [{"ts": None, "text": line} for line in text.splitlines()]
    return jsonify({"run_id": run_id, "offset": start, "next_offset": next_offset, "eof": next_offset >= size, "lines": lines})


def _terminate_pid(pid: int | None) -> None:
    if not pid or pid <= 0:
        return
    try:
        os.killpg(pid, signal.SIGTERM)
    except ProcessLookupError:
        return
    except Exception:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            return
    deadline = time.monotonic() + 15
    while time.monotonic() < deadline:
        if not run_store.pid_alive(pid):
            return
        time.sleep(0.2)
    try:
        os.killpg(pid, signal.SIGKILL)
    except Exception:
        try:
            os.kill(pid, signal.SIGKILL)
        except ProcessLookupError:
            pass


@bp.post("/runs/<run_id>/cancel")
def cancel_run(run_id: str) -> tuple[Response, int] | Response:
    run = run_store.get_run(run_id)
    if not run:
        return _json_error(404, "run_not_found")
    if run.get("state") in TERMINAL_STATES:
        return jsonify({"run_id": run_id, "state": run["state"]})

    _terminate_pid(run.get("pid"))
    current = run_store.get_run(run_id) or run
    if current.get("state") in TERMINAL_STATES:
        return jsonify({"run_id": run_id, "state": current["state"]})
    if current.get("run_dir"):
        shutil.rmtree(current["run_dir"], ignore_errors=True)
    v1._clear_run_lock_files()
    run_store.finalize_run(
        run_id,
        "CANCELLED",
        {},
        expected_state=current["state"],
        exit_code=-signal.SIGTERM,
        failure_reason="cancelled",
    )
    return jsonify({"run_id": run_id, "state": "CANCELLED"})


@bp.post("/maintenance/reap")
def reap() -> Response:
    return jsonify({"reaped": _run_reaper_once()})
