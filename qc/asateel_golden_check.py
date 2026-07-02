#!/usr/bin/env python3
"""Run the Asateel CENTRAL golden gate and fail on any snapshot drift."""
from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_JSON = ROOT / "qc" / "asateel_golden_expected.json"
SUMMARY_JSON = ROOT / "matched" / "asateel-summary.json"
ALLOCATION_JSON = ROOT / "matched" / "asateel-allocation.json"
GOLDEN_COMMAND = ["python3", "pipelines/asateel.py", "--folder", "CENTRAL", "--full"]


def _load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _row_key(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "invoice_no": str(row.get("invoice_no") or "").zfill(5),
        "line_no": row.get("line_no"),
        "row_status": row.get("row_status") or row.get("status") or "",
    }


def _actual_snapshot() -> dict[str, Any]:
    summary = _load_json(SUMMARY_JSON)
    allocation = _load_json(ALLOCATION_JSON)
    status_counts = {"GREEN": 0, "YELLOW": 0, "RED": 0}
    for key, value in (summary.get("row_status_counts") or {}).items():
        if key in status_counts:
            status_counts[key] = int(value)
        else:
            status_counts[key] = value

    blank_rows = []
    for invoice in allocation:
        for row in invoice.get("allocation_rows", []):
            if not str(row.get("cost_center") or "").strip():
                blank_rows.append(_row_key(row))
    blank_rows = sorted(blank_rows, key=lambda r: (r["invoice_no"], str(r["line_no"])))

    return {
        "command": GOLDEN_COMMAND,
        "allocation_lines": int(summary.get("allocation_lines", 0)),
        "row_status_counts": status_counts,
        "blank_cost_center_rows": len(blank_rows),
        "blank_cost_center_invoices": sorted({r["invoice_no"] for r in blank_rows}),
        "blank_cost_center_row_keys": blank_rows,
        "invoice_count": int(summary.get("invoice_count", 0)),
        "reconciled_invoices": int(summary.get("reconciled_invoices", 0)),
        "mismatched_invoices": int(summary.get("mismatched_invoices", 0)),
    }


def _diff(expected: dict[str, Any], actual: dict[str, Any]) -> list[str]:
    lines = []
    keys = [
        "command",
        "allocation_lines",
        "row_status_counts",
        "blank_cost_center_rows",
        "blank_cost_center_invoices",
        "blank_cost_center_row_keys",
        "invoice_count",
        "reconciled_invoices",
        "mismatched_invoices",
    ]
    for key in keys:
        if expected.get(key) != actual.get(key):
            lines.append(f"{key}:")
            lines.append(f"  expected: {json.dumps(expected.get(key), ensure_ascii=False, sort_keys=True)}")
            lines.append(f"  actual:   {json.dumps(actual.get(key), ensure_ascii=False, sort_keys=True)}")
    return lines


def main() -> int:
    expected = _load_json(EXPECTED_JSON)
    print("+ " + " ".join(GOLDEN_COMMAND), flush=True)
    result = subprocess.run(GOLDEN_COMMAND, cwd=ROOT)
    if result.returncode:
        print(f"GOLDEN DRIFT: command exited {result.returncode}", file=sys.stderr)
        return result.returncode

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
