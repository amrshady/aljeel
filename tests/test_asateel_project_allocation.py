import copy
import json
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from pipelines import asateel
from scripts.asateel_project_allocation import (
    DEFAULT_LOOKUP_PATH,
    ProjectLookupValidationError,
    build_lookup,
    load_lookup,
    resolve_override,
)


WORKBOOK_CELLS = ROOT / "tests" / "fixtures" / "asateel_project_labadi_workbook_cells.json"
MASTER = ROOT / "qc" / "master-data" / "Aljeel_Lookups-v2.xlsx"


def _supplier_record(agency: str, agency_code: str, employee_no: str) -> dict:
    return {
        "row": 9,
        "invoice_no": "00001",
        "description": "fixture / 00001",
        "jq": "",
        "employee_name": "",
        "employee_number": employee_no,
        "agency": agency,
        "agency_code": agency_code,
        "agency_name": agency,
        "agency_resolve_method": "fixture",
        "agency_resolve_score": 1.0,
        "division_code": "194",
        "division": "IVD Solutions",
        "cost_center": "160012",
        "cost_center_name": "IVD Solutions",
        "solution_code": "00000",
        "solution_name": "General",
        "solution_note": "",
        "amount": 100.0,
        "_amount_basis": "supplier_row_amount",
        "_jq_count": 0,
        "_jq_index": 0,
    }


def _extraction(folder: str) -> list[dict]:
    return [{
        "folder": folder,
        "invoice_hint": "00001",
        "pdf": "/fixture/00001_0001.pdf",
        "payload": {"pdf": "/fixture/00001_0001.pdf", "extraction": {
            "invoice_number": "00001",
            "invoice_date": "2026-07-01",
            "subtotal": 100.0,
            "vat": 15.0,
            "total": 115.0,
            "lines": [{"line_no": 1, "description": "ride", "line_subtotal": 100.0}],
            "signals": [],
            "extraction_notes": [],
        }},
    }]


def _build_one(folder: str, supplier: dict, mode: str, lookup: dict | None) -> dict:
    engine = asateel._load_v6_engine()
    rows, _ = engine.build_rows(
        _extraction(folder),
        engine.load_lookups(),
        {"00001": [supplier]},
        {},
        available_pdf_invoice_numbers={"00001"},
        allocation_mode=mode,
        project_lookup=lookup,
    )
    assert len(rows) == 1
    return rows[0]


def test_project_agency_then_employee_override_uses_normalized_exact_alias():
    lookup = load_lookup()
    row = _build_one("PROJECTS", _supplier_record("BIO RAD", "", "1000001"), "projects-labadi-v1", lookup)

    assert row["Agency"] == "10111"
    assert row["Agency Name"] == "Bio-Rad"
    assert row["Employee No"] == "1001982"
    assert row["allocation_source"] == "projects-labadi-v1"
    assert row["_project_allocation_audit"]["agency_match_method"] == "normalized_alias_exact"
    assert row["_project_allocation_audit"]["employee_match_method"] == "agency_manager"


def test_bmx_junior_maps_to_explicit_designated_head():
    lookup = load_lookup()
    row = _build_one("PROJECTS", _supplier_record("BMX", "10153", "1002057"), "projects-labadi-v1", lookup)

    assert row["Agency"] == "10153"
    assert row["Employee No"] == "1001686"
    assert row["_project_allocation_audit"]["employee_match_method"] == "employee_code_exact"
    assert "1002057" in row["_project_allocation_audit"]["explanation"]
    assert "1001686" in row["_project_allocation_audit"]["explanation"]


def test_canonical_agency_code_is_pre_resolved_without_name_search():
    audit = resolve_override(load_lookup(), agency_code="10111", agency_name="", employee_no="irrelevant")

    assert audit["status"] == "applied"
    assert audit["agency_match_method"] == "canonical_code_exact"
    assert audit["agency_after"] == {"code": "10111", "name": "Bio-Rad"}
    assert audit["employee_after"]["employee_no"] == "1001982"


def test_standard_non_project_path_is_identical_when_lookup_is_present():
    supplier = _supplier_record("Bio-Rad", "10111", "1000526")
    without_lookup = _build_one("CENTRAL", copy.deepcopy(supplier), "standard", None)
    with_lookup = _build_one("CENTRAL", copy.deepcopy(supplier), "standard", load_lookup())

    assert without_lookup == with_lookup
    assert with_lookup["Agency"] == "10111"
    assert with_lookup["Employee No"] == "1000526"
    assert with_lookup["_project_allocation_audit"] is None


def test_all_scope_project_mode_does_not_touch_non_project_invoice():
    supplier = _supplier_record("Bio-Rad", "10111", "1000526")
    standard = _build_one("CENTRAL", copy.deepcopy(supplier), "standard", None)
    all_scope_central = _build_one(
        "CENTRAL", copy.deepcopy(supplier), "projects-labadi-v1", load_lookup()
    )

    assert standard == all_scope_central
    assert all_scope_central["Employee No"] == "1000526"
    assert all_scope_central["_project_allocation_audit"] is None


def test_unknown_bmx_employee_is_reviewable_and_not_guessed():
    row = _build_one("PROJECTS", _supplier_record("BMX", "10153", "1999999"), "projects-labadi-v1", load_lookup())

    assert row["Agency"] == "10153"
    assert row["Employee No"] == "1999999"
    assert row["Row_Status"] == "YELLOW"
    assert row["_project_allocation_audit"]["status"] == "unresolved_employee"
    assert row["_project_allocation_audit"]["employee_after"] is None


def test_conflicting_agency_code_and_alias_is_ambiguous():
    audit = resolve_override(load_lookup(), agency_code="10072", agency_name="Bio-Rad", employee_no="1000526")

    assert audit["status"] == "ambiguous_agency"
    assert audit["agency_after"] is None
    assert audit["employee_after"] is None


def test_lookup_loader_rejects_alias_collisions(tmp_path: Path):
    data = copy.deepcopy(load_lookup())
    data["agency_rules"][0]["agency_aliases"].append("Bio-Rad")
    path = tmp_path / "ambiguous.json"
    path.write_text(json.dumps(data), encoding="utf-8")

    try:
        load_lookup(path)
    except ProjectLookupValidationError as exc:
        assert "ambiguous agency alias" in str(exc)
    else:
        raise AssertionError("ambiguous normalized alias should fail validation")


def test_workbook_regeneration_matches_reviewed_relationships(tmp_path: Path):
    cells = json.loads(WORKBOOK_CELLS.read_text(encoding="utf-8"))
    workbook_path = tmp_path / "Labadi-Book1-fixture.xlsx"
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Sheet1"
    for coordinate, value in cells.items():
        ws[coordinate] = value
    wb.save(workbook_path)
    wb.close()

    regenerated = build_lookup(workbook_path, MASTER)
    reviewed = json.loads(DEFAULT_LOOKUP_PATH.read_text(encoding="utf-8"))

    assert regenerated["agency_rules"] == reviewed["agency_rules"]
    assert regenerated["statistics"] == reviewed["statistics"]
    assert regenerated["validation"] == reviewed["validation"]
    assert regenerated["precedence"] == reviewed["precedence"]
