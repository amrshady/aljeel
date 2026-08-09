from decimal import Decimal
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from qc.score_against_truth import (
    PipelineRow,
    TruthRow,
    _norm,
    discover_columns,
    extract_line_identifier,
    load_truth,
    normalize_employee_set,
    pair_sponsorship_rows,
    pair_travel_rows,
    score_pairs,
    sponsorship_group_key,
)


TRUTH_1108 = ROOT / "qc/fixtures/golden-j26-1108/J26-1108-truth-clerk-reviewed.xlsx"
PIPE_1108 = ROOT / "batches/jawal-J26-1108/output/Spreadsheet-J26-1108-FILLED-v30.xlsx"
TRUTH_640 = ROOT / "qc/fixtures/golden-j640/jawal-J26-640-resolved.xlsx"
SEGMENTS = dict(account="60307021", cc="160011", div="196", solution="0", agency="10055")


def truth(row, employee="1001", amount="10", description="event (26-1001)", **values):
    data = dict(excel_row=row, emp_no=employee, employee_set=frozenset({employee}) if employee else frozenset(), amount=Decimal(amount), description=description, identifier=extract_line_identifier(description), kind="sponsorship", invoice_ref="REF", opex_serial="CE-1", **SEGMENTS)
    data.update(values)
    return TruthRow(**data)


def pipe(row, employees="1001", amount="10", description="event (26-1001)", **values):
    data = dict(excel_row=row, emp_no=employees, employee_set=normalize_employee_set(employees), amount=Decimal(amount), description=description, identifier=extract_line_identifier(description), invoice_ref="REF", opex_serial="CE-1", **SEGMENTS)
    data.update(values)
    return PipelineRow(**data)


def test_discovers_both_j26_1108_header_layouts():
    truth_layout = discover_columns(TRUTH_1108)
    pipe_layout = discover_columns(PIPE_1108)
    assert (truth_layout.sheet_name, truth_layout.header_row, truth_layout.columns["emp_no"]) == ("Sheet1", 3, 18)
    assert (pipe_layout.sheet_name, pipe_layout.header_row, pipe_layout.columns["emp_no"]) == ("Sheet1", 3, 16)
    assert truth_layout.columns["distribution"] == 15
    assert pipe_layout.columns["distribution"] == 14


def test_extracts_four_digit_voucher_and_full_long_gds_identifier():
    assert extract_line_identifier("Hotel (26-1027)") == "26-1027"
    assert extract_line_identifier("Ticket 1234567890123") == "1234567890123"


def test_blank_segment_is_distinct_from_zero():
    assert _norm(None) == ""
    assert _norm("") == ""
    assert _norm("00000") == "0"
    assert _norm(None) != _norm(0)


def test_n_to_one_travel_pairs_each_truth_row_deterministically():
    truths = [truth(4, amount="7", kind="travel"), truth(5, employee="1002", amount="3", kind="travel")]
    pipeline = [pipe(4, employees="1001,1002", amount="10")]
    pairing = pair_travel_rows(truths, pipeline)
    assert len(pairing.pairs) == 2
    assert pairing.multiplicity_counts == {"N:1": 1}
    assert all(item.method == "shared-pipeline" for item in pairing.pairs)


def test_split_sponsorship_truth_matches_combined_employee_set():
    truths = [truth(4, "1001", "7"), truth(5, "1002", "3")]
    pipeline = [pipe(4, "1002, 1001", "10")]
    pairing = pair_sponsorship_rows(truths, pipeline)
    scored = score_pairs(pairing)
    assert pairing.virtual_sponsorship_allocations == 2
    assert scored["per_field"]["emp_no"] == {"match": 2, "mismatch": 0, "mismatches": []}
    assert scored["full5_emp"] == 2


def test_employee_sets_ignore_order_and_surrounding_whitespace():
    assert normalize_employee_set(" 1002, 1001 ,1003 ") == frozenset({"1001", "1002", "1003"})
    assert normalize_employee_set("1003,1002,1001") == normalize_employee_set("1001, 1002, 1003")


def test_missing_and_unexpected_sponsorship_employees_are_separate():
    pairing = pair_sponsorship_rows([truth(4, "1001"), truth(5, "1002")], [pipe(4, "1001,1003")])
    assert pairing.missing_employees == 1
    assert pairing.extra_employees == 1


def test_duplicate_opex_serial_is_separated_by_description_and_reference():
    first = truth(4, description="CE-1 Hotel", invoice_ref="A")
    second = truth(5, description="CE-1 Registration", invoice_ref="B")
    assert first.opex_serial == second.opex_serial
    assert sponsorship_group_key(first) != sponsorship_group_key(second)


def test_sponsorship_amount_sum_integrity_mismatch_is_diagnostic_only():
    pairing = pair_sponsorship_rows([truth(4, amount="7"), truth(5, "1002", amount="3")], [pipe(4, "1001,1002", amount="9")])
    assert pairing.amount_sum_mismatches == 1
    assert len(pairing.pairs) == 2


def test_unique_invoice_reference_amount_fallback_pairs_ticketless_truth():
    malformed = truth(4, description="HASHAD/T+K41+K15:AF16", invoice_ref="1000181", amount="691.30", kind="travel")
    counterpart = pipe(9, description="Person (4860528664)", invoice_ref="1000181", amount="691.30")
    pairing = pair_travel_rows([malformed], [counterpart])
    assert pairing.pairs[0].method == "unique-reference-amount"
    assert pairing.ambiguous_groups == 0


def test_ambiguous_invoice_reference_fallback_is_rejected():
    malformed = truth(4, description="malformed", invoice_ref="X", amount="10", kind="travel")
    pairing = pair_travel_rows([malformed], [pipe(5, invoice_ref="X"), pipe(6, invoice_ref="X")])
    assert pairing.pairs[0].pipeline is None
    assert pairing.ambiguous_groups == 1


def test_j26_640_dash_employee_compatibility():
    rows = load_truth(TRUTH_640, "j26-640")
    assert len(rows) == 117
    assert rows[0].emp_no == ""
    assert rows[0].employee_set == frozenset()
