from pathlib import Path
from types import SimpleNamespace
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from excel_styling import classify_row
from process_batch import get_human_action_recommendation


def _status(*flags, account="", emp_match_method="", is_sponsorship=False):
    gate = SimpleNamespace(hard_failures=[], soft_flags=[])
    resolved = SimpleNamespace(
        flags=list(flags),
        account=account,
        emp_match_method=emp_match_method,
        is_sponsorship=is_sponsorship,
        sol_flag="",
        _v2_confidence=1.0,
    )
    return classify_row(gate, resolved)


def test_plain_employee_not_in_master_is_red():
    assert _status("EMPLOYEE_NOT_IN_MASTER") == "RED"


def test_sponsorship_employee_not_in_master_is_not_red_and_note_is_suppressed():
    flags = ["EMPLOYEE_NOT_IN_MASTER", "SPONSORSHIP_DETECTED"]
    assert _status(*flags, account="60307021") == "GREEN"
    note = get_human_action_recommendation(flags, "", "GREEN", "", "60307021")
    assert "not found in the Manpower" not in note


def test_family_employee_not_in_master_is_not_red():
    assert _status("NEW_EMPLOYEE_NOT_IN_MASTER", account="21070229") == "GREEN"


def test_sponsorship_with_no_approval_remains_red():
    assert _status(
        "EMPLOYEE_NOT_IN_MASTER", "SPONSORSHIP_DETECTED", "NO_APPROVAL",
        account="60307021",
    ) == "RED"
