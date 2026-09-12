from pathlib import Path
import sys


ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
sys.path.insert(0, str(ROOT / "scripts"))

import run_v30


def _run_row(monkeypatch, tmp_path, selected_folder, resolved_folder, ref_status="REF_FOLDER", llm=None):
    selected_evidence = {"files": [str(selected_folder / "selected.pdf")], "total_chars": 1}
    classify = {
        "row_type": "unclear",
        "employee_no_in_doc": "",
        "requesting_emp_no": "",
        "sponsorship_agency_from_form": "",
        "_folder": str(selected_folder),
        "_evidence": selected_evidence,
    }
    seen = {}
    monkeypatch.setattr("run_v16.classify_row", lambda *args, **kwargs: dict(classify))
    monkeypatch.setattr(run_v30, "find_folder_v25", lambda *args, **kwargs: None)
    monkeypatch.setattr(
        run_v30,
        "resolve_invoice_ref_folder",
        lambda *args, **kwargs: (resolved_folder, ref_status, "test resolution"),
    )
    monkeypatch.setattr(
        run_v30.fea,
        "collect_evidence",
        lambda folder: {"files": [str(Path(folder) / "resolved.pdf")], "total_chars": 2},
    )

    def full_resolve(*args, **kwargs):
        seen["classify"] = args[2]
        return dict(llm or {"account": "60301003", "emp_no": ""})

    monkeypatch.setattr("run_v16.full_resolve_row", full_resolve)
    monkeypatch.setattr("run_v16.apply_overlays_v16", lambda result, *args: (dict(result), "test"))
    monkeypatch.setattr("run_v16.enforce_sponsorship_rules", lambda final, *args: final)
    monkeypatch.setattr(run_v30, "_apply_multi_salesman_from_opex", lambda *args, **kwargs: None)

    result = run_v30.process_row_v25(
        1,
        {"Description": "FAHMI AL KAF - Hotel", "Invoice Ref No": "HF-2026-30"},
        "INVOICE_REF_FOLDER",
        "J26-1247",
        tmp_path,
        [selected_folder, resolved_folder],
        {},
        {},
        invoice_ref_index={},
    )
    return result, seen["classify"]


def test_invoice_ref_route_replaces_batch_root_with_exact_event_folder(tmp_path, monkeypatch):
    batch_root = tmp_path / "J26-1247"
    event_folder = batch_root / "HF-2026-30"
    event_folder.mkdir(parents=True)

    result, classify = _run_row(monkeypatch, tmp_path, batch_root, event_folder)

    assert classify["_folder"] == str(event_folder)
    assert result["_step_trace"]["call1"]["folder_corrected"] is True
    assert result["_step_trace"]["call1"]["invoice_ref_status"] == "REF_FOLDER"


def test_specific_folder_is_not_replaced_by_root(tmp_path, monkeypatch):
    batch_root = tmp_path / "J26-1247"
    event_folder = batch_root / "HF-2026-30"
    event_folder.mkdir(parents=True)

    result, classify = _run_row(monkeypatch, tmp_path, event_folder, batch_root)

    assert classify["_folder"] == str(event_folder)
    assert result["_step_trace"]["call1"]["folder_corrected"] is False


def test_fuzzy_invoice_ref_never_replaces_selected_folder(tmp_path, monkeypatch):
    batch_root = tmp_path / "J26-1247"
    selected = batch_root / "HF-2026-30"
    fuzzy = batch_root / "HF-2025-30"
    fuzzy.mkdir(parents=True)
    selected.mkdir()

    result, classify = _run_row(monkeypatch, tmp_path, selected, fuzzy, "REF_FUZZY")

    assert classify["_folder"] == str(selected)
    assert result["_step_trace"]["call1"]["folder_corrected"] is False
    assert result["_step_trace"]["call1"]["invoice_ref_status"] == "REF_FUZZY"


def test_hf_hotel_row_uses_existing_sponsorship_allocation_path(tmp_path, monkeypatch):
    apply_allocations = run_v30._apply_multi_salesman_from_opex
    batch_root = tmp_path / "J26-1247"
    event_folder = batch_root / "HF-2026-30"
    event_folder.mkdir(parents=True)
    opex_pdf = event_folder / "OPEX-HF-2026-30.pdf"
    opex_pdf.write_bytes(b"synthetic form")
    llm = {
        "account": "60307021",
        "emp_no": "",
        "solution": "10050",
        "opex_serial": "HF-2026-30",
    }
    row, classify = _run_row(monkeypatch, tmp_path, batch_root, event_folder, llm=llm)
    monkeypatch.setattr(run_v30, "_apply_multi_salesman_from_opex", apply_allocations)
    row["_evidence_folder"] = classify["_folder"]
    row["_invoice_ref_folder_status"] = classify["_invoice_ref_folder_status"]
    monkeypatch.setattr(
        run_v30,
        "_extract_sponsorship_allocations_from_opex_pdf",
        lambda path, manpower=None: (
            ["1002483"],
            [{"emp_no": "1002483", "name": "Rawad Malaeb", "amount": "10,000.00"}],
        ),
    )
    run_v30._OPEX_EVENT_INDEX_CACHE.clear()

    allocated, review = run_v30.apply_sponsorship_allocations(
        [row],
        [{"Description": "RAZAN ALRIFAIE - Hotel", "Invoice Ref No": "HF-2026-30"}],
        batch_root,
        [event_folder],
        {},
        {"1002483": {"name": "Rawad Nabil Malaeb"}},
    )

    assert (allocated, review) == (1, 0)
    assert (row["emp_no"], row["account"], row["solution"]) == (
        "1002483", "60307021", "10050"
    )
