#!/usr/bin/env python3
"""Run the Jawal J26-788 golden gate and fail on any snapshot drift.

This gate intentionally snapshots the committed v15.11.2 sidecar artifact
instead of re-running the cascade. The human regeneration command is:

    python3 scripts/process_batch.py --batch batches/jawal-J26-788 --raw-dir batches/jawal-J26-788/raw --suffix v15.11.2

That command is the deterministic Stage-1 cascade, but it writes over the
locked artifact names, updates timestamp/path fields, and may touch persistent
cross-batch cache/history. The broader PROCESS wrapper also requires .env and
GEMINI_API_KEY and performs extra non-golden checks. To keep this regression
gate read-only and offline, it compares only stable deterministic aggregates
from the committed known-good summary-v15.11.2.json.

KNOWN LIMITATION (tracked 2026-07-06): because this gate reads the committed
summary artifact instead of re-running the cascade, it catches baseline/artifact
tampering but NOT a live pipeline-code regression (a code change that would
produce a different summary is invisible until someone regenerates the artifact).
FUTURE UPGRADE: run the deterministic Stage-1 cascade into an ISOLATED temp
output dir (no clobbering the locked v15.11.2 files or the cross-batch cache),
snapshot that fresh run, and diff it here. Do NOT block current use on this.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_JSON = ROOT / "qc" / "jawal_golden_expected.json"
SUMMARY_JSON = ROOT / "batches" / "jawal-J26-788" / "output" / "summary-v15.11.2.json"
GOLDEN_COMMAND = [
    "python3",
    "scripts/process_batch.py",
    "--batch",
    "batches/jawal-J26-788",
    "--raw-dir",
    "batches/jawal-J26-788/raw",
    "--suffix",
    "v15.11.2",
]


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _int_breakdown(values: dict[str, Any], keys: list[str] | None = None) -> dict[str, Any]:
    if keys is None:
        return {str(key): int(value) for key, value in values.items()}
    return {key: int(values.get(key, 0)) for key in keys}


def _actual_snapshot() -> dict[str, Any]:
    summary = _load_json(SUMMARY_JSON)
    row_status = _int_breakdown(
        summary.get("row_status_breakdown") or {},
        ["GREEN", "YELLOW", "RED"],
    )
    labadi_qc = _int_breakdown(
        summary.get("labadi_qc_check") or {},
        [
            "rows_checked",
            "blank_emp_no",
            "opex_serial_missing",
            "annual_approval_missing",
            "amount_exceeds_invoice",
        ],
    )

    return {
        "command": GOLDEN_COMMAND,
        "total_lines": int(summary.get("total_lines", 0)),
        "row_status_breakdown": row_status,
        "clean_lines": int(summary.get("clean_lines", 0)),
        "hard_failures": int(summary.get("hard_failures", 0)),
        "soft_flags": int(summary.get("soft_flags", 0)),
        "flag_breakdown": _int_breakdown(summary.get("flag_breakdown") or {}),
        "match_method_breakdown": _int_breakdown(summary.get("match_method_breakdown") or {}),
        "account_breakdown": _int_breakdown(summary.get("account_breakdown") or {}),
        "halt_queue_count": int(summary.get("halt_queue_count", 0)),
        "within_batch_catches": int(summary.get("within_batch_catches", 0)),
        "cross_batch_catches": int(summary.get("cross_batch_catches", 0)),
        "catches_by_category": _int_breakdown(summary.get("catches_by_category") or {}),
        "labadi_qc_check": labadi_qc,
        "resolution_tally": {
            "resolved": row_status["GREEN"],
            "exception": row_status["YELLOW"] + row_status["RED"],
            "blank_key_rows": labadi_qc["blank_emp_no"],
        },
    }


def _diff(expected: dict[str, Any], actual: dict[str, Any]) -> list[str]:
    lines = []
    keys = [
        "command",
        "total_lines",
        "row_status_breakdown",
        "clean_lines",
        "hard_failures",
        "soft_flags",
        "flag_breakdown",
        "match_method_breakdown",
        "account_breakdown",
        "halt_queue_count",
        "within_batch_catches",
        "cross_batch_catches",
        "catches_by_category",
        "labadi_qc_check",
        "resolution_tally",
    ]
    for key in keys:
        if expected.get(key) != actual.get(key):
            lines.append(f"{key}:")
            lines.append(f"  expected: {json.dumps(expected.get(key), ensure_ascii=False, sort_keys=True)}")
            lines.append(f"  actual:   {json.dumps(actual.get(key), ensure_ascii=False, sort_keys=True)}")
    return lines


def main() -> int:
    expected = _load_json(EXPECTED_JSON)
    print("+ artifact snapshot: " + str(SUMMARY_JSON.relative_to(ROOT)), flush=True)
    actual = _actual_snapshot()
    diffs = _diff(expected, actual)
    if diffs:
        print("GOLDEN DRIFT", file=sys.stderr)
        print("\n".join(diffs), file=sys.stderr)
        return 1
    print("GOLDEN OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
