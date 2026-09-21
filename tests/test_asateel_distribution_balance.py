import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipelines import asateel
from qc import qc_gate


def _row(invoice_no: str, header_gross: float, amount: float, status: str = "GREEN"):
    return {
        "*Invoice Number": invoice_no,
        "_header_total": header_gross,
        "*Amount": amount,
        "line_amount": amount,
        "Row_Status": status,
        "notes": "",
    }


def test_exact_and_five_halala_boundaries_pass():
    for amount in (100.00, 99.95, 100.05):
        rows = [_row("1", 115.00, amount)]
        assert asateel._distribution_balance(rows) == []
        assert rows[0]["Row_Status"] == "GREEN"


def test_six_halala_boundaries_fail_and_turn_rows_red():
    for amount in (99.94, 100.06):
        rows = [_row("1", 115.00, amount, status="YELLOW")]
        failures = asateel._distribution_balance(rows)
        assert failures[0]["delta_halala"] in (-6, 6)
        assert rows[0]["Row_Status"] == "RED"


def test_04672_style_shortage_is_red():
    rows = [_row("04672", 1437.50, 416.67), _row("04672", 1437.50, 416.67)]
    failures = asateel._distribution_balance(rows)
    assert failures == [{
        "invoice_no": "04672",
        "passed": False,
        "expected_net_halala": 125000,
        "actual_net_halala": 83334,
        "delta_halala": -41666,
        "tolerance_halala": 5,
    }]
    assert {row["Row_Status"] for row in rows} == {"RED"}


def test_only_failing_invoice_rows_turn_red():
    rows = [
        _row("04672", 1437.50, 416.67),
        _row("04672", 1437.50, 416.67),
        _row("04674", 115.00, 60.00),
        _row("04674", 115.00, 40.00),
    ]
    failures = asateel._distribution_balance(rows)
    assert [failure["invoice_no"] for failure in failures] == ["04672"]
    assert [row["Row_Status"] for row in rows] == ["RED", "RED", "GREEN", "GREEN"]


def test_whole_riyal_remainder_is_assigned_to_last_distribution_line():
    engine = asateel._load_v6_engine()
    rows = [_row("04672", 1437.50, 416.67) for _ in range(3)]

    result = engine.enforce_whole_riyal_invoice_totals(rows)

    assert [row["*Amount"] for row in rows] == [416.67, 416.67, 416.66]
    assert result[0]["final_total_halala"] == 125000


def test_qc_gate_recomputes_rows_without_trusting_reconciled_flag():
    records = [{
        "invoice_no": "04672",
        "header_total": 1437.50,
        "allocation_sum": 1250.00,
        "reconciled": True,
        "allocation_rows": [{"amount_sar": 416.67}, {"amount_sar": 416.67}],
    }]

    assert qc_gate._asateel_balance_failures(records) == [
        "04672: expected=1250.00 actual=833.34 delta=-416.66 RED"
    ]
