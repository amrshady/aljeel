from pathlib import Path
import re
import sys


ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
sys.path.insert(0, str(ROOT / "scripts"))

from msg_parser import parse_msg
from oracle_form_parser import parse_form
from trip_purpose_classifier import classify_trip
from run_v30 import _norm_master_code, apply_own_form_trip_purpose_precedence
from split_multi_emp import load_manpower


def _find_training_form_fixture():
    raw_root = ROOT / "batches" / "jawal-J26-954" / "raw"
    for folder in sorted(p for p in raw_root.rglob("*") if p.is_dir()):
        ticket_match = re.search(r"\b\d{10}\b", folder.name)
        if not ticket_match:
            continue
        for msg in sorted(folder.glob("*.msg")):
            parsed = parse_msg(msg, use_cache=True)
            body = parsed.get("body_text", "") or ""
            form = parse_form(body)
            if not form:
                continue
            trip = classify_trip(
                subject=parsed.get("subject", "") or "",
                body=body,
                form_data=form,
                description="",
                passenger_name="",
            )
            if trip.trip_purpose == "TRAINING" and trip.account_override:
                return folder, ticket_match.group(0), form, trip
    raise AssertionError("No dedicated-ticket training form fixture found")


def _find_business_form_fixture():
    raw_root = ROOT / "batches" / "jawal-J26-954" / "raw"
    manpower = load_manpower(str(ROOT / "qc" / "master-data" / "Aljeel_Lookups-v2.xlsx"))
    for folder in sorted(p for p in raw_root.rglob("*") if p.is_dir()):
        ticket_match = re.search(r"\b\d{10}\b", folder.name)
        if not ticket_match:
            continue
        for msg in sorted(folder.glob("*.msg")):
            parsed = parse_msg(msg, use_cache=True)
            body = parsed.get("body_text", "") or ""
            form = parse_form(body)
            if not form:
                continue
            emp_no = str(form.get("emp_no") or "")
            trip = classify_trip(
                subject=parsed.get("subject", "") or "",
                body=body,
                form_data=form,
                description="",
                passenger_name="",
            )
            solution = str(manpower.get(emp_no, {}).get("solution") or "").strip()
            if (
                trip.trip_purpose == "BUSINESS_TRIP"
                and not trip.account_override
                and emp_no in manpower
                and solution
            ):
                return folder, ticket_match.group(0), form, trip, manpower
    raise AssertionError("No dedicated-ticket business-trip form fixture found")


def test_own_approved_training_form_drives_training_account():
    folder, ticket_no, form, trip = _find_training_form_fixture()
    emp_no = str(form.get("emp_no") or "")
    assert emp_no

    hybrid_rows = [{
        "_row_idx": 2,
        "_agent_method": "cascade",
        "emp_no": "",
        "account": "60301003",
        "cost_center": "",
        "div": "",
        "solution": "",
        "agency": "",
    }]
    cascade_rows = [{
        "Description": f"FORM/FIXTURE MR - AAA BBB ({ticket_no})",
        "Notes": "",
    }]
    changed = apply_own_form_trip_purpose_precedence(
        hybrid_rows,
        cascade_rows,
        {},
        [folder],
    )

    assert changed == 1
    assert hybrid_rows[0]["account"] == trip.account_override
    assert cascade_rows[0]["Trip Purpose"] == trip.trip_purpose


def test_own_approved_business_form_records_default_travel_account():
    folder, ticket_no, form, trip, manpower = _find_business_form_fixture()
    emp_no = str(form.get("emp_no") or "")
    resolved_solution = _norm_master_code(manpower[emp_no].get("solution", ""), "solution")

    hybrid_rows = [{
        "_row_idx": 2,
        "_agent_method": "llm_agent",
        "emp_no": "",
        "account": "60307021",
        "cost_center": "",
        "div": "",
        "solution": resolved_solution,
        "agency": "",
    }]
    cascade_rows = [{
        "Description": f"FORM/FIXTURE MR - AAA BBB ({ticket_no})",
        "Notes": "",
    }]
    changed = apply_own_form_trip_purpose_precedence(
        hybrid_rows,
        cascade_rows,
        manpower,
        [folder],
    )

    assert changed == 1
    assert hybrid_rows[0]["emp_no"] == emp_no
    assert hybrid_rows[0]["account"] in {"60301003", "60301004"}
    assert hybrid_rows[0]["solution"] == resolved_solution
    assert cascade_rows[0]["Trip Purpose"] == trip.trip_purpose
