from pathlib import Path
from types import SimpleNamespace
import sys

import fitz


ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
sys.path.insert(0, str(ROOT / "scripts"))

import process_batch as process_batch_module
from evidence_bundle_index import build_bundled_ticket_aliases
from msg_parser import find_msgs_for_ticket
from oracle_form_parser import parse_form
from trip_purpose_classifier import classify_trip, detect_family_clusters


HOST = "4861482325"
RETURN = "4861482326"


def _touch_msg(raw: Path, ticket_no: str, filename: str = "approval.msg") -> Path:
    folder = raw / ticket_no
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / filename
    path.write_bytes(b"test")
    return path


def _write_pdf(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), text)
    doc.save(path)
    doc.close()


def test_direct_folder_wins_without_consulting_sibling(tmp_path):
    direct = _touch_msg(tmp_path, RETURN, "direct.msg")
    _touch_msg(tmp_path, HOST, "host.msg")

    assert find_msgs_for_ticket(RETURN, tmp_path, [HOST]) == [direct]


def test_direct_miss_returns_explicit_host_folder_messages(tmp_path):
    host_msg = _touch_msg(tmp_path, HOST)

    assert find_msgs_for_ticket(RETURN, tmp_path, [HOST]) == [host_msg]


def test_direct_and_alias_miss_returns_empty(tmp_path):
    assert find_msgs_for_ticket(RETURN, tmp_path, [HOST]) == []


def test_direct_and_duplicate_aliases_do_not_duplicate_paths(tmp_path):
    direct = _touch_msg(tmp_path, RETURN)

    assert find_msgs_for_ticket(RETURN, tmp_path, [RETURN, RETURN]) == [direct]


def test_ambiguous_pdf_hosts_produce_no_alias(tmp_path):
    _touch_msg(tmp_path, HOST)
    other_host = "4861482999"
    _touch_msg(tmp_path, other_host)
    _write_pdf(tmp_path / HOST / "shared.pdf", f"{HOST} {RETURN}")
    _write_pdf(tmp_path / other_host / "shared.pdf", f"{other_host} {RETURN}")

    aliases = build_bundled_ticket_aliases(tmp_path)

    assert RETURN not in aliases
    assert find_msgs_for_ticket(RETURN, tmp_path, aliases.get(RETURN)) == []


def test_process_stages_share_bundle_fallback_and_preserve_missing_paths(tmp_path, monkeypatch):
    host_msg = _touch_msg(tmp_path, HOST)
    no_form_host = "4861482400"
    no_form_child = "4861482401"
    no_form_msg = _touch_msg(tmp_path, no_form_host, "no-form.msg")
    _write_pdf(tmp_path / HOST / "shared.pdf", f"Outbound {HOST} Return {RETURN}")
    _write_pdf(
        tmp_path / no_form_host / "shared.pdf",
        f"Outbound {no_form_host} Return {no_form_child}",
    )

    form_body = """Personal Contribution

Farhan Alanazi

Person Number 1234567

Business Trip

Trip Goal

Customer Visit

Travel Method

Air
""" + ("approval details\n" * 20)
    parsed_by_path = {
        host_msg: {"parse_method": "test", "subject": "Business trip approval", "body_text": form_body},
        no_form_msg: {"parse_method": "test", "subject": "FYI", "body_text": "plain message"},
    }
    monkeypatch.setattr(
        process_batch_module,
        "parse_msg",
        lambda path, use_cache=True: parsed_by_path[Path(path)],
    )
    monkeypatch.setattr(process_batch_module, "detect_sponsorship", lambda **kwargs: None)

    aliases = build_bundled_ticket_aliases(tmp_path)
    resolved = SimpleNamespace(emp_no=None)
    md = SimpleNamespace(employees={})

    return_result, return_flags = process_batch_module._validate_with_email_form(
        resolved, "Farhan Alanazi", RETURN, 0, tmp_path, md,
        sibling_ticket_nos=aliases[RETURN],
    )
    host_result, host_flags = process_batch_module._validate_with_email_form(
        resolved, "Farhan Alanazi", HOST, 0, tmp_path, md,
        sibling_ticket_nos=aliases.get(HOST),
    )
    _, unrelated_flags = process_batch_module._validate_with_email_form(
        resolved, "Unrelated", "4861482777", 0, tmp_path, md,
        sibling_ticket_nos=aliases.get("4861482777"),
    )
    _, no_form_flags = process_batch_module._validate_with_email_form(
        resolved, "No form", no_form_child, 0, tmp_path, md,
        sibling_ticket_nos=aliases[no_form_child],
    )

    return_msg = find_msgs_for_ticket(RETURN, tmp_path, aliases[RETURN])[0]
    return_parsed = parsed_by_path[return_msg]
    return_form = parse_form(return_parsed["body_text"])
    return_trip = classify_trip(
        subject=return_parsed["subject"], body=return_parsed["body_text"],
        form_data=return_form, description="Farhan Alanazi", passenger_name="Farhan Alanazi",
    )
    clusters = detect_family_clusters([
        {
            "sl_no": 1, "passenger_name": "ALANAZI/FARHAN MR",
            "description": f"ALANAZI/FARHAN MR - RUH JED RUH ({HOST})",
            "route": "RUH JED RUH", "trip_purpose": return_trip.trip_purpose,
        },
        {
            "sl_no": 2, "passenger_name": "ALANAZI/FARHAN MR",
            "description": f"ALANAZI/FARHAN MR - RUH JED RUH ({RETURN})",
            "route": "RUH JED RUH", "trip_purpose": return_trip.trip_purpose,
        },
    ])

    assert aliases[RETURN] == (HOST,)
    assert "FORM_NOT_FOUND_IN_EMAIL" not in return_flags
    assert return_result["form_emp_no"] == "1234567"
    assert return_result["form_trip_goal"] == "Customer Visit"
    assert "FORM_NOT_FOUND_IN_EMAIL" not in host_flags
    assert host_result["form_emp_no"] == "1234567"
    assert return_trip.trip_purpose == "BUSINESS_TRIP"
    assert not clusters[2]["mixed"]
    assert unrelated_flags == ["FORM_NOT_FOUND_IN_EMAIL"]
    assert no_form_flags == ["FORM_NOT_FOUND_IN_EMAIL"]
