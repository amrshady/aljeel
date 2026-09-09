import ast
import inspect
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import run_v30


def _home(solution):
    return {
        "cost_center": "160014",
        "div_code": "170",
        "solution": solution,
        "agency_code": "10072",
        "location": "10100",
    }


def _final_sponsorship_pass_order():
    tree = ast.parse(inspect.getsource(run_v30.main))
    names = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in {
                "apply_sponsorship_allocations",
                "apply_sponsorship_event_segments",
            }:
                names.append((node.lineno, node.func.id))
    return [name for _line, name in sorted(names)]


def test_final_stage_allocates_before_resolving_j26_1140_segments(tmp_path, monkeypatch):
    events = {
        "CRM-2026-43": ("1000640", "10017"),
        "HF-2026-31": ("1000820", "10050"),
        "CRM-2026-45": ("1001762", "10017"),
        "CRM-2026-46": ("1001959", "10017"),
        "EP-2026-21": ("1000433", "10064"),
    }
    event_folders = []
    allocation_by_pdf = {}
    for serial, (emp_no, _solution) in events.items():
        folder = tmp_path / serial
        folder.mkdir()
        pdf = folder / f"OPEX-{serial}.pdf"
        pdf.write_bytes(b"fixture")
        event_folders.append(folder)
        allocation_by_pdf[pdf.name] = emp_no

    invoice_refs = [
        "CRM-2026-43", "HF-2026-31", "CRM-2026-45",
        "CRM-2026-46", "CRM-2026-43",
        "CRM-2026-46", "EP-2026-21", "EP-2026-21",
        "CRM-2026-43", "CRM-2026-43",
    ]
    rows = [
        {
            "account": "60307021",
            "emp_no": "1001008",
            "cost_center": "250010",
            "div": "120",
            "solution": "00000",
            "agency": "10072",
        }
        for _ in invoice_refs
    ]
    line_ids = [
        "26-1049", "26-1051", "26-1075", "26-1076", "26-1082",
        "4860901746", "4860966793", "4860966794", "4861063587", "4861063588",
    ]
    cascades = [
        {
            "Invoice Ref No": serial,
            "Form Agency (Fusion code)": "10072",
            "Description": line_id,
        }
        for serial, line_id in zip(invoice_refs, line_ids)
    ]
    manpower = {
        "1001008": {
            "cost_center": "250010", "div_code": "120", "solution": "00000",
            "agency_code": "10072", "location": "10100",
        },
        "1000640": _home("10017"),
        "1000820": _home("10050"),
        "1001762": _home("10017"),
        "1001959": _home("10017"),
        "1000433": _home("10064"),
    }

    def allocations(pdf, *args):
        emp_no = allocation_by_pdf[pdf.name]
        details = [{"emp_no": emp_no, "name": "Allocated employee", "amount": ""}]
        return [emp_no], details

    monkeypatch.setattr(
        run_v30, "_extract_sponsorship_allocations_from_opex_pdf", allocations
    )
    monkeypatch.setattr(
        run_v30,
        "resolve_sponsorship_codes_from_agency",
        lambda agency, records: (None, "AGENCY_CODES_INCONSISTENT"),
    )

    for pass_name in _final_sponsorship_pass_order():
        if pass_name == "apply_sponsorship_allocations":
            run_v30.apply_sponsorship_allocations(
                rows, cascades, tmp_path, event_folders, {}, manpower
            )
        else:
            run_v30.apply_sponsorship_event_segments(
                rows, cascades, manpower, tmp_path, event_folders, {}
            )

    assert _final_sponsorship_pass_order() == [
        "apply_sponsorship_allocations",
        "apply_sponsorship_event_segments",
    ]
    assert [
        (row["cost_center"], row["div"], row["solution"], row["agency"])
        for row in rows
    ] == [
        ("160014", "170", "10017", "10072"),
        ("160014", "170", "10050", "10072"),
        ("160014", "170", "10017", "10072"),
        ("160014", "170", "10017", "10072"),
        ("160014", "170", "10017", "10072"),
        ("160014", "170", "10017", "10072"),
        ("160014", "170", "10064", "10072"),
        ("160014", "170", "10064", "10072"),
        ("160014", "170", "10017", "10072"),
        ("160014", "170", "10017", "10072"),
    ]


def test_exact_non_sis_ref_rejects_unrelated_folder_and_uses_matching_opex(tmp_path):
    unrelated = tmp_path / "0F6C2F9AA"
    matching = tmp_path / "CRM-2026-43"
    unrelated.mkdir()
    matching.mkdir()
    (unrelated / "Personal Contribution.pdf").write_bytes(b"fixture")
    (matching / "OPEX-CRM-2026-43-J-2026-144.pdf").write_bytes(b"fixture")

    row = {
        "_evidence_folder": str(unrelated),
        "_invoice_ref_folder_status": "REF_FOLDER",
    }
    cascade = {"Invoice Ref No": "CRM-2026-43", "Description": "Airport pickup"}

    found = run_v30._sponsorship_event_folder_for_row(
        row, cascade, tmp_path, [unrelated, matching], {}
    )

    assert found == matching
    assert found != unrelated
