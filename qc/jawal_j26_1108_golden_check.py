#!/usr/bin/env python3
"""Read-only, offline J26-1108 artifact-based semantic golden gate.

This validates committed artifacts and scorer semantics.  It intentionally does
not run the live pipeline; a pipeline-code regression is visible only after a
fresh artifact is produced and reviewed.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path
from typing import Any

try:
    from qc.score_against_truth import ALL_FIELDS, discover_columns, load_truth, score_workbooks
except ModuleNotFoundError:  # direct execution from qc/
    from score_against_truth import ALL_FIELDS, discover_columns, load_truth, score_workbooks


ROOT = Path(__file__).resolve().parents[1]
TRUTH = ROOT / "qc/fixtures/golden-j26-1108/J26-1108-truth-clerk-reviewed.xlsx"
PIPELINE = ROOT / "batches/jawal-J26-1108/output/Spreadsheet-J26-1108-FILLED-v30.xlsx"
EXPECTED = ROOT / "qc/jawal_j26_1108_golden_expected.json"


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _compact_fields(values: dict[str, Any]) -> dict[str, dict[str, int]]:
    return {
        name: {"match": int(values[name]["match"]), "mismatch": int(values[name]["mismatch"])}
        for name in ALL_FIELDS
    }


def actual_snapshot() -> dict[str, object]:
    truth_layout = discover_columns(TRUTH)
    pipeline_layout = discover_columns(PIPELINE)
    truth_rows = load_truth(TRUTH, "j26-1108")
    score = score_workbooks(PIPELINE, TRUTH, "j26-1108")
    return {
        "schema_version": "jawal-j26-1108-golden/v1",
        "scorer_schema_version": score["scorer_schema_version"],
        "artifact_gate": True,
        "truth_sha256": _sha256(TRUTH),
        "pipeline_sha256": _sha256(PIPELINE),
        "structure": {
            "truth_sheet": truth_layout.sheet_name,
            "truth_header_row": truth_layout.header_row,
            "truth_columns": truth_layout.columns,
            "pipeline_sheet": pipeline_layout.sheet_name,
            "pipeline_header_row": pipeline_layout.header_row,
            "pipeline_columns": pipeline_layout.columns,
            "truth_physical_rows": len(truth_rows),
            "truth_employee_coverage": sum(bool(row.emp_no) for row in truth_rows),
            "truth_sponsorship_rows": sum(row.kind == "sponsorship" for row in truth_rows),
            "truth_sponsorship_employee_coverage": sum(row.kind == "sponsorship" and bool(row.emp_no) for row in truth_rows),
            "ticketless_truth_rows": sum(row.identifier is None for row in truth_rows),
        },
        "pipeline_physical_rows": score["pipe_rows"],
        "logical_virtual_evaluated": score["logical_virtual_evaluated"],
        "per_field": _compact_fields(score["per_field"]),
        "all_5": score["full5"],
        "all_5_plus_employee": score["full5_emp"],
        "off_by_1": score["off_by_1"],
        "sponsorship": {
            "evaluated": score["sponsorship"]["n"],
            "per_field": _compact_fields(score["sponsorship"]["per_field"]),
            "all_5": score["sponsorship"]["full5"],
            "all_5_plus_employee": score["sponsorship"]["full5_emp"],
        },
        "travel": {
            "evaluated": score["travel"]["n"],
            "per_field": _compact_fields(score["travel"]["per_field"]),
            "all_5": score["travel"]["full5"],
            "all_5_plus_employee": score["travel"]["full5_emp"],
        },
        "account_breakout": score["account_breakout"],
        "pairing_integrity": score["pairing_integrity"],
        "truth_only_logical_groups": score["truth_only_logical_groups"],
        "pipeline_only_logical_groups": score["pipeline_only_logical_groups"],
        "end_to_end": score["end_to_end"],
    }


def diff_snapshot(expected: dict[str, object], actual: dict[str, object]) -> list[str]:
    diffs: list[str] = []

    def walk(prefix: str, left: Any, right: Any) -> None:
        if isinstance(left, dict) and isinstance(right, dict):
            for key in sorted(set(left) | set(right)):
                walk(f"{prefix}.{key}" if prefix else key, left.get(key), right.get(key))
        elif left != right:
            diffs.append(f"{prefix}: expected={json.dumps(left, ensure_ascii=False, sort_keys=True)} actual={json.dumps(right, ensure_ascii=False, sort_keys=True)}")

    walk("", expected, actual)
    return diffs


def _validate_invariants(snapshot: dict[str, Any]) -> list[str]:
    structure = snapshot["structure"]
    required = {
        "truth_sheet": "Sheet1", "truth_header_row": 3,
        "pipeline_sheet": "Sheet1", "pipeline_header_row": 3,
        "truth_physical_rows": 102, "truth_employee_coverage": 102,
        "truth_sponsorship_rows": 19, "truth_sponsorship_employee_coverage": 19,
        "ticketless_truth_rows": 1,
    }
    errors = [f"structure.{key}: required={value!r} actual={structure.get(key)!r}" for key, value in required.items() if structure.get(key) != value]
    if snapshot["logical_virtual_evaluated"] + len(snapshot["truth_only_logical_groups"]) < 102:
        errors.append("truth coverage: one or more truth rows were silently skipped")
    return errors


def main() -> int:
    expected = json.loads(EXPECTED.read_text(encoding="utf-8"))
    print(f"+ primary artifact semantic gate: {PIPELINE.relative_to(ROOT)}", flush=True)
    actual = actual_snapshot()
    diffs = _validate_invariants(actual) + diff_snapshot(expected, actual)
    if diffs:
        print("J26-1108 GOLDEN DRIFT", file=sys.stderr)
        print("\n".join(diffs), file=sys.stderr)
        return 1
    print("J26-1108 GOLDEN OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
