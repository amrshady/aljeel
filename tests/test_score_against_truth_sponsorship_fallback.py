from decimal import Decimal
from pathlib import Path
import sys

import openpyxl


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from qc.jawal_j26_1108_golden_check import _validate_invariants
from qc.score_against_truth import (
    PipelineRow,
    TruthRow,
    discover_columns,
    extract_line_identifier,
    normalize_employee_set,
    pair_rows_by_policy,
    score_pairs,
)


SEGMENTS = dict(account="60307021", cc="160014", div="170", solution="10050", agency="10072")


def truth(row, employee="1001", amount="10", description="HF2026-28 Event (26-998)", **values):
    data = dict(
        excel_row=row,
        emp_no=employee,
        employee_set=frozenset({employee}),
        amount=Decimal(amount),
        description=description,
        identifier=extract_line_identifier(description),
        kind="sponsorship",
        invoice_ref="REF-28",
        opex_serial="HF2026-28",
        **SEGMENTS,
    )
    data.update(values)
    return TruthRow(**data)


def pipe(row, employees="1001", amount="10", description="HF-2026-28 Event (26-998)", **values):
    data = dict(
        excel_row=row,
        emp_no=employees,
        employee_set=normalize_employee_set(employees),
        amount=Decimal(amount),
        description=description,
        identifier=extract_line_identifier(description),
        invoice_ref="REF-28",
        opex_serial="HF-2026-28",
        **SEGMENTS,
    )
    data.update(values)
    return PipelineRow(**data)


def test_account_classification_and_serial_normalization_keep_sponsorship_out_of_travel():
    pairing = pair_rows_by_policy([truth(4)], [pipe(4)])

    assert len(pairing.pairs) == 1
    assert pairing.pairs[0].kind == "sponsorship"
    assert pairing.pairs[0].pipeline is not None
    assert "travel|26-998" not in pairing.pipeline_only_groups


def test_stable_identifier_fallback_preserves_n_to_one_allocations_and_physical_coverage():
    truths = [
        truth(4, "1001", "3", invoice_ref="A"),
        truth(5, "1002", "3", invoice_ref="B", opex_serial="HF 2026 28"),
        truth(6, "1003", "4", invoice_ref="C", description="Event (26-998)"),
    ]
    pairing = pair_rows_by_policy(truths, [pipe(9, "1001,1002,1003", "10")])
    scored = score_pairs(pairing)

    assert scored["sponsorship"]["n"] == 3
    assert pairing.multiplicity_counts == {"N:1": 1}
    assert scored["pairing_integrity"]["unmatched_truth_physical_rows"] == 0

    snapshot = {
        "structure": {
            "truth_sheet": "Sheet1",
            "truth_header_row": 3,
            "pipeline_sheet": "Sheet1",
            "pipeline_header_row": 3,
            "truth_physical_rows": 3,
            "truth_employee_coverage": 3,
            "truth_sponsorship_rows": 3,
            "truth_sponsorship_employee_coverage": 3,
            "ticketless_truth_rows": 0,
        },
        "logical_virtual_evaluated": 3,
        "pairing_integrity": scored["pairing_integrity"],
    }
    assert "truth coverage: one or more truth rows were silently skipped" not in _validate_invariants(snapshot)


def test_ambiguous_sponsorship_fallback_is_rejected_with_explicit_detail():
    truths = [truth(4, invoice_ref="A", description="First (26-998)"), truth(5, invoice_ref="B", description="Second (26-998)")]
    pipes = [pipe(8, invoice_ref="C", description="Third (26-998)"), pipe(9, invoice_ref="D", description="Fourth (26-998)")]

    pairing = pair_rows_by_policy(truths, pipes)

    assert pairing.ambiguous_groups == 1
    assert pairing.ambiguity_details == ["sponsorship-ambiguous|26-998|truth_rows=2|pipeline_rows=2"]
    assert all(pair.truth is None or pair.pipeline is None for pair in pairing.pairs)


def _write_layout(path, spacer):
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    headers = [
        "Invoice Ref No", "Company", "Location", "Account", "Cost Center", "Div",
        "Solution", "Agency", "OPEX Serial", "OPEX Allocation Details", "Description",
    ]
    if spacer:
        headers.append(None)
    headers.append("Route")
    headers.extend(["*Amount", "Distribution Combination", "Notes", "Employee No"])
    for col, value in enumerate(headers, 1):
        ws.cell(3, col, value)
    wb.save(path)


def test_discover_columns_is_header_driven_with_and_without_spacer(tmp_path):
    no_spacer = tmp_path / "no-spacer.xlsx"
    spacer = tmp_path / "spacer.xlsx"
    _write_layout(no_spacer, False)
    _write_layout(spacer, True)

    assert discover_columns(no_spacer).columns["amount"] == 13
    assert discover_columns(no_spacer).columns["emp_no"] == 16
    assert discover_columns(spacer).columns["amount"] == 14
    assert discover_columns(spacer).columns["emp_no"] == 17
