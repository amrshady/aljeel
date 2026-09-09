from pathlib import Path
import sys

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import run_v30


@pytest.mark.parametrize(
    ("filename", "event_key"),
    [
        ("APPROVED-OPEX-HF-2026-28-J-2026-141.pdf", "HF-2026-28"),
        ("0094.pdf", "CRM-2026-42"),
    ],
)
def test_sponsoring_form_index_uses_content_aware_pdf_discovery(
    tmp_path, monkeypatch, filename, event_key
):
    folder = tmp_path / event_key
    folder.mkdir()
    pdf = folder / filename
    pdf.write_bytes(b"synthetic sponsoring form")

    monkeypatch.setattr(
        run_v30,
        "_find_opex_pdfs",
        lambda candidate: [pdf] if candidate == tmp_path else [],
    )
    monkeypatch.setattr(
        run_v30,
        "_extract_sponsorship_allocations_from_opex_pdf",
        lambda candidate, manpower=None: (
            ["1002483"],
            [{"emp_no": "1002483", "name": "Allocated", "amount": "100.00"}],
        ),
    )
    monkeypatch.setattr(run_v30, "_opex_pdf_event_key", lambda candidate: event_key)

    assert run_v30._build_sponsoring_form_folder_index(tmp_path) == {
        event_key: folder
    }


@pytest.mark.parametrize(
    ("event_key", "initial_location"),
    [("HF-2026-28", "10100"), ("CRM-2026-42", "40100")],
)
def test_exact_form_ref_promotes_after_employee_travel_overlay(
    tmp_path, event_key, initial_location
):
    folder = tmp_path / event_key
    folder.mkdir()
    row = {
        # This is the result after apply_overlays_v16 treats an IATA passenger
        # name as an employee and changes Call 2 sponsorship back to travel.
        "account": "60301003",
        "emp_no": "1009999",
        "location": initial_location,
        "_sponsoring_form_folder": str(folder),
    }
    cascade = {
        "Invoice Ref No": event_key,
        "Description": "ALAMRI/MANAL - 4860576079",
    }

    promoted = run_v30._apply_authoritative_sponsoring_form_promotions(
        [row], [cascade]
    )

    assert promoted == 1
    assert row["account"] == "60307021"
    assert row["emp_no"] == ""
    assert row["location"] == ""
    assert row["_evidence_folder"] == str(folder)
    assert row["_sponsoring_form_folder"] == str(folder)


def test_j26_1108_exact_forms_flow_through_existing_allocation_and_segment_passes(
    tmp_path, monkeypatch
):
    fixtures = {
        "HF-2026-28": (
            "APPROVED-OPEX-HF-2026-28-J-2026-141.pdf", "1002483", "10050"
        ),
        "CRM-2026-42": ("0094.pdf", "1001959", "10017"),
    }
    pdfs = {}
    for event_key, (filename, _emp_no, _solution) in fixtures.items():
        folder = tmp_path / event_key
        folder.mkdir()
        pdf = folder / filename
        pdf.write_bytes(b"synthetic sponsoring form")
        pdfs[folder] = pdf

    monkeypatch.setattr(
        run_v30,
        "_find_opex_pdfs",
        lambda folder: [pdfs[folder]] if folder in pdfs else [],
    )

    def allocations(pdf, manpower=None):
        event_key = next(key for key in fixtures if key in str(pdf.parent))
        emp_no = fixtures[event_key][1]
        return [emp_no], [{"emp_no": emp_no, "name": "Allocated", "amount": "100.00"}]

    monkeypatch.setattr(
        run_v30, "_extract_sponsorship_allocations_from_opex_pdf", allocations
    )
    monkeypatch.setattr(
        run_v30,
        "_parse_opex_event_segments",
        lambda folder, cascade: {"agency": "10072", "source": "synthetic form"},
    )
    monkeypatch.setattr(
        run_v30,
        "resolve_sponsorship_codes_from_agency",
        lambda agency, manpower: (None, "AGENCY_CODES_INCONSISTENT"),
    )

    cascades = [
        {"Invoice Ref No": event_key, "Description": ticket}
        for event_key, ticket in (
            ("HF-2026-28", "4860576027"),
            ("CRM-2026-42", "ALAMRI/MANAL - 4860576079"),
        )
    ]
    rows = []
    for cascade, location in zip(cascades, ("10100", "40100")):
        event_key = cascade["Invoice Ref No"]
        rows.append(
            {
                "account": "60301003",
                "emp_no": "1009999",
                "cost_center": "999999",
                "div": "999",
                "solution": "99999",
                "agency": "99999",
                "location": location,
                "_sponsoring_form_folder": str(tmp_path / event_key),
                "_sponsoring_form_event_key": run_v30._canonical_event_serial(event_key),
            }
        )
    manpower = {
        emp_no: {
            "cost_center": "160014",
            "div_code": "170",
            "solution": solution,
            "agency_code": "10072",
            "location": "20100",
        }
        for _event_key, (_filename, emp_no, solution) in fixtures.items()
    }

    assert run_v30._apply_authoritative_sponsoring_form_promotions(rows, cascades) == 2
    assert run_v30.apply_sponsorship_allocations(
        rows, cascades, tmp_path, list(pdfs), {}, manpower
    ) == (2, 0)
    assert run_v30.apply_sponsorship_event_segments(
        rows, cascades, manpower, tmp_path, list(pdfs), {}
    ) == 2

    assert [
        (
            cascade["Description"].split(" - ")[-1],
            cascade["Invoice Ref No"],
            row["account"],
            f'{row["cost_center"]}-{row["div"]}-{row["solution"]}-{row["agency"]}',
            row["emp_no"],
            row["location"],
        )
        for row, cascade in zip(rows, cascades)
    ] == [
        ("4860576027", "HF-2026-28", "60307021", "160014-170-10050-10072", "1002483", "20100"),
        ("4860576079", "CRM-2026-42", "60307021", "160014-170-10017-10072", "1001959", "20100"),
    ]
