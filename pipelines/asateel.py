#!/usr/bin/env python3
"""
Production Asateel pipeline.

The maintained allocation engine lives in asateel-sample/asateel_poc.py. The
production entrypoint delegates to its supplier-authoritative allocation logic
and adapts Oracle rows into the JSON contracts under matched/. SO_Detail is
used only for canonical-JQ existence validation.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")
MATCHED = ROOT / "matched"
EXTRACT = ROOT / "extracted"
POC_PATH = ROOT / "asateel-sample" / "asateel_poc.py"

ORACLE_XLSX = MATCHED / "asateel-oracle-upload.xlsx"
TRACE_JSON = MATCHED / "asateel-trace.json"
ALLOCATION_JSON = MATCHED / "asateel-allocation.json"
CATCH_JSON = MATCHED / "asateel-catch.json"
SUMMARY_JSON = MATCHED / "asateel-summary.json"
PDF_HEADERS_JSON = EXTRACT / "asateel-pdf-headers.json"

VAT_RATE = 0.15
DEFAULT_FOLDER = "CENTRAL"
DEFAULT_EXPENSES_FORMAT_XLSX = ROOT / "asateel-sample" / "_allocation" / "Central-11-2026.xlsx"
DEFAULT_SO_DETAIL_XLSX = ROOT / "reference" / "SO_Detail_Labadi_1_R21_AA.xlsx"
DEFAULT_PROJECT_ALLOCATION_LOOKUP = ROOT / "pipelines" / "lookups" / "asateel_projects_labadi_v1.json"
STANDARD_ALLOCATION_MODE = "standard"
PROJECT_ALLOCATION_MODE = "projects-labadi-v1"


def _load_v6_engine():
    spec = importlib.util.spec_from_file_location("asateel_v6_engine", POC_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load v6 Asateel engine from {POC_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _clean(v: Any) -> str:
    if v is None:
        return ""
    return str(v).strip()


def _money(v: Any) -> float:
    if v in (None, ""):
        return 0.0
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return 0.0


def _code(v: Any, width: int | None = None) -> str:
    s = _clean(v)
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]
    if width and s.isdigit():
        return s.zfill(width)
    return s


def _json_safe(v: Any) -> Any:
    if isinstance(v, dict):
        return {str(k): _json_safe(val) for k, val in v.items()}
    if isinstance(v, list):
        return [_json_safe(item) for item in v]
    if isinstance(v, tuple):
        return [_json_safe(item) for item in v]
    if hasattr(v, "item"):
        try:
            return v.item()
        except Exception:
            pass
    if hasattr(v, "isoformat"):
        try:
            return v.isoformat()
        except Exception:
            pass
    return v


def _row_public(row: dict[str, Any]) -> dict[str, Any]:
    supplier = row.get("_supplier_match") if isinstance(row.get("_supplier_match"), dict) else {}
    return {
        "invoice_no": _code(row.get("invoice_no"), 5),
        "invoice_date": row.get("invoice_date") or row.get("*Invoice Date") or "",
        "line_no": row.get("line_no"),
        "row_status": row.get("Row_Status"),
        "status": row.get("Row_Status"),
        "amount_sar": _money(row.get("line_amount") or row.get("*Amount")),
        "vat_sar": _money(row.get("vat")),
        "total_sar": _money(row.get("total")),
        "split_method": row.get("split_method"),
        "allocation_source": row.get("allocation_source"),
        "employee_no": _code(row.get("Employee No") or supplier.get("employee_number")),
        "jq": row.get("_so_detail_jq") or supplier.get("jq") or "",
        "supplier_jq_count": row.get("_supplier_jq_count") or supplier.get("_jq_count") or "",
        "supplier_jq_index": supplier.get("_jq_index") or "",
        "source_jq_cell": supplier.get("_source_jq_cell") or "",
        "agency_code": _code(row.get("Agency"), 5),
        "agency_name": row.get("Agency Name") or "",
        "so_detail_agency": row.get("_so_detail_agency") or "",
        "so_detail_salesperson": row.get("_so_detail_salesperson") or "",
        "so_detail_vs_supplier_discrepancy": row.get("_so_detail_supplier_discrepancy") or "",
        "supplier_sheet_agency": row.get("_supplier_sheet_agency") or "",
        "manpower_home_agency": row.get("_manpower_home_agency") or "",
        "home_agency_discrepancy": row.get("_supplier_home_agency_discrepancy") or "",
        "division": row.get("DIV") or "",
        "division_name": row.get("Contribution") or "",
        "cost_center": row.get("Cost Center") or "",
        "cost_center_name": row.get("Cost Name") or "",
        "solution": row.get("Solution") or "",
        "solution_name": row.get("Solution Name") or "",
        "distribution_combination": row.get("Distribution Combination[..]") or "",
        "additional_information": row.get("_additional_information") or "",
        "notes": row.get("notes") or "",
        "trace_pdf": row.get("_trace_pdf") or "",
        "exception_category": row.get("_exception_category") or "",
        "project_allocation": row.get("_project_allocation_audit"),
    }


def _invoice_records(rows: list[dict[str, Any]], trace: dict[str, Any]) -> list[dict[str, Any]]:
    by_invoice: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        by_invoice[_code(row.get("invoice_no") or row.get("*Invoice Number"), 5)].append(row)

    trace_by_invoice = {
        _code(item.get("expected_invoice") or (item.get("extraction") or {}).get("invoice_number"), 5): item
        for item in trace.get("invoices", [])
        if isinstance(item, dict)
    }

    records = []
    for inv in sorted(by_invoice):
        inv_rows = by_invoice[inv]
        header_total = max((_money(r.get("_header_total") or r.get("*Invoice Amount")) for r in inv_rows), default=0.0)
        allocation_sum = round(sum(_money(r.get("line_amount") or r.get("*Amount")) for r in inv_rows), 2)
        expected_gross = round(allocation_sum * (1 + VAT_RATE), 2)
        delta = round(expected_gross - header_total, 2)
        statuses = Counter(_clean(r.get("Row_Status")) or "UNKNOWN" for r in inv_rows)
        reconciled = abs(delta) < 1.00
        record = {
            "invoice_no": inv,
            "invoice_date": inv_rows[0].get("invoice_date") or inv_rows[0].get("*Invoice Date") or "",
            "header_total": header_total,
            "allocation_sum": allocation_sum,
            "expected_gross_vat15": expected_gross,
            "delta": delta,
            "reconciled": reconciled,
            "status": "reconciled" if reconciled else "mismatch",
            "allocation_lines": len(inv_rows),
            "jq_lines": sum(1 for r in inv_rows if (r.get("_supplier_match") or {}).get("jq")),
            "cc_direct_lines": sum(1 for r in inv_rows if not (r.get("_supplier_match") or {}).get("jq")),
            "distinct_employees": len({_code((r.get("_supplier_match") or {}).get("employee_number") or r.get("Employee No")) for r in inv_rows if _code((r.get("_supplier_match") or {}).get("employee_number") or r.get("Employee No"))}),
            "divisions": sorted({_clean(r.get("Contribution") or r.get("Division")) for r in inv_rows if _clean(r.get("Contribution") or r.get("Division"))}),
            "agencies": sorted({_clean(r.get("Agency Name") or r.get("Agency_name")) for r in inv_rows if _clean(r.get("Agency Name") or r.get("Agency_name"))}),
            "row_status_counts": dict(statuses),
            "supplier_jq_unit_count": (trace_by_invoice.get(inv) or {}).get("supplier_jq_unit_count", 0),
            "allocation_rows": [_row_public(r) for r in inv_rows],
        }
        records.append(record)
    return records


def _catch_records(invoice_records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    catches = []
    for rec in invoice_records:
        if not rec["reconciled"]:
            catches.append({
                "category": "ALLOC_MISMATCH",
                "severity": "HIGH",
                "invoice_no": rec["invoice_no"],
                "value_at_risk_sar": abs(rec["delta"]),
                "detail": (
                    f"Header SAR {rec['header_total']:.2f} != allocation x1.15 "
                    f"SAR {rec['expected_gross_vat15']:.2f} (delta SAR {rec['delta']:+.2f})."
                ),
                "evidence": {"allocation_rows": rec["allocation_rows"]},
            })
        for row in rec["allocation_rows"]:
            project_audit = row.get("project_allocation") or {}
            if project_audit and project_audit.get("status") != "applied":
                catches.append({
                    "category": "PROJECT_ALLOCATION_LOOKUP_REVIEW",
                    "severity": "MEDIUM",
                    "invoice_no": rec["invoice_no"],
                    "employee_no": row.get("employee_no"),
                    "jq": row.get("jq"),
                    "value_at_risk_sar": 0.0,
                    "detail": project_audit.get("explanation"),
                    "evidence": {"allocation_rows": [row]},
                })
            elif row.get("exception_category") == "MISSING_PDF":
                catches.append({
                    "category": "MISSING_PDF",
                    "severity": "HIGH",
                    "invoice_no": rec["invoice_no"],
                    "employee_no": row.get("employee_no"),
                    "jq": row.get("jq"),
                    "value_at_risk_sar": 0.0,
                    "detail": row.get("notes"),
                    "evidence": {"allocation_rows": [row]},
                })
            elif row.get("so_detail_vs_supplier_discrepancy") == "Y":
                catches.append({
                    "category": "SO_DETAIL_SUPPLIER_DISCREPANCY",
                    "severity": "MEDIUM",
                    "invoice_no": rec["invoice_no"],
                    "employee_no": row.get("employee_no"),
                    "jq": row.get("jq"),
                    "value_at_risk_sar": 0.0,
                    "detail": (
                        f"SO_Detail agency {row.get('so_detail_agency')} differs from "
                        f"Supplier Sheet agency {row.get('supplier_sheet_agency')}; supplier sheet retained."
                    ),
                    "evidence": {"allocation_rows": [row]},
                })
            elif row.get("home_agency_discrepancy") == "Y":
                catches.append({
                    "category": "HOME_AGENCY_DISCREPANCY",
                    "severity": "MEDIUM",
                    "invoice_no": rec["invoice_no"],
                    "employee_no": row.get("employee_no"),
                    "jq": row.get("jq"),
                    "value_at_risk_sar": 0.0,
                    "detail": (
                        f"Supplier agency {row.get('supplier_sheet_agency')} differs from "
                        f"Manpower home agency {row.get('manpower_home_agency')}; supplier sheet used."
                    ),
                    "evidence": {"allocation_rows": [row]},
                })
            elif row.get("row_status") in {"RED", "YELLOW"}:
                catches.append({
                    "category": "ALLOCATION_REVIEW",
                    "severity": "MEDIUM" if row.get("row_status") == "YELLOW" else "HIGH",
                    "invoice_no": rec["invoice_no"],
                    "employee_no": row.get("employee_no"),
                    "jq": row.get("jq"),
                    "value_at_risk_sar": 0.0,
                    "detail": row.get("notes") or f"Row status {row.get('row_status')} requires review.",
                    "evidence": {"allocation_rows": [row]},
                })
    return catches


def _summary(
    rows: list[dict[str, Any]],
    invoice_records: list[dict[str, Any]],
    catches: list[dict[str, Any]],
    validation: dict[str, Any],
    header_diffs: list[str],
    args: argparse.Namespace,
    input_fingerprints: dict[str, Any],
    provenance: dict[str, Any],
) -> dict[str, Any]:
    status_counts = Counter(_clean(r.get("Row_Status")) or "UNKNOWN" for r in rows)
    source_counts = Counter(_clean(r.get("allocation_source")) or "none" for r in rows)
    split_counts = Counter(_clean(r.get("split_method")) or "n/a" for r in rows)
    by_cat = Counter(c["category"] for c in catches)
    project_status_counts = Counter(
        _clean((r.get("_project_allocation_audit") or {}).get("status"))
        for r in rows
        if r.get("_project_allocation_audit")
    )
    return {
        "vendor": "Asateel Al-Tareeq / supplier Expenses Format v6",
        "period": "Central Region 11-2026",
        "folder": args.folder,
        "full_run": bool(args.full),
        "engine": "asateel-sample/asateel_poc.py v6",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "invoice_count": len(invoice_records),
        "allocation_lines": len(rows),
        "reconciled_invoices": sum(1 for r in invoice_records if r["reconciled"]),
        "unallocated_invoices": 0,
        "mismatched_invoices": sum(1 for r in invoice_records if not r["reconciled"]),
        "reconciliation_rate": round(
            100 * sum(1 for r in invoice_records if r["reconciled"]) / len(invoice_records),
            1,
        ) if invoice_records else 0.0,
        "total_invoice_value_sar": round(sum(r["header_total"] for r in invoice_records), 2),
        "line_excl_vat_total_sar": round(sum(_money(r.get("line_amount") or r.get("*Amount")) for r in rows), 2),
        "exception_count": len(catches),
        "value_at_risk_sar": round(sum(_money(c.get("value_at_risk_sar")) for c in catches), 2),
        "exceptions_by_category": dict(sorted(by_cat.items())),
        "row_status_counts": dict(sorted(status_counts.items())),
        "allocation_source_counts": dict(sorted(source_counts.items())),
        "split_method_counts": dict(sorted(split_counts.items())),
        "oracle_xlsx": str(ORACLE_XLSX),
        "trace_json": str(TRACE_JSON),
        "supplier_expenses_format_path": str(args.expenses_format),
        "so_detail_path": str(args.so_detail),
        "allocation_mode": args.allocation_mode,
        "project_allocation_lookup_path": str(args.project_allocation_lookup) if args.allocation_mode == PROJECT_ALLOCATION_MODE else "",
        "project_lookup_status_counts": dict(sorted(project_status_counts.items())),
        "input_fingerprints": input_fingerprints,
        "provenance": provenance,
        "header_validation": {
            "a_to_af_match_reference": not header_diffs,
            "diffs": header_diffs,
        },
        "legacy_entry_sheet_comparison": {
            key: validation.get(key)
            for key in [
                "comparable_rows",
                "agency_hits",
                "cost_center_hits",
                "division_hits",
                "all_segment_hits",
                "distribution_hits",
                "amount_hits",
                "agency_rate",
                "cost_center_rate",
                "division_rate",
                "all_segment_rate",
                "distribution_rate",
                "amount_rate",
            ]
        },
    }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run production Asateel v6 allocation pipeline locally")
    parser.add_argument(
        "--folder",
        choices=["PROJECTS", "ADMIN", "CENTRAL", "MAIN", "EASTERN", "WESTERN", "ALL"],
        default=DEFAULT_FOLDER,
    )
    parser.add_argument("--pdf-dir", default="", help="Optional directory of *_0001.pdf files to process with the folder label")
    parser.add_argument("--full", action="store_true", default=True, help="Process every *_0001.pdf in the selected folder")
    parser.add_argument("--sample", action="store_false", dest="full", help="Process only the POC sample set")
    parser.add_argument("--refresh-cache", action="store_true", help="Force fresh Gemini extraction")
    parser.add_argument("--expenses-format", default=str(DEFAULT_EXPENSES_FORMAT_XLSX))
    parser.add_argument("--so-detail", default="")
    parser.add_argument(
        "--allocation-mode",
        choices=[STANDARD_ALLOCATION_MODE, PROJECT_ALLOCATION_MODE],
        default=STANDARD_ALLOCATION_MODE,
        help="Use the separate Labadi override for PROJECTS invoices only",
    )
    parser.add_argument(
        "--project-allocation-lookup",
        default=str(DEFAULT_PROJECT_ALLOCATION_LOOKUP),
        help="Normalized deterministic project allocation JSON",
    )
    return parser.parse_args(argv)


def run(argv: list[str] | None = None) -> dict[str, Any]:
    args = parse_args(argv)
    if args.allocation_mode == PROJECT_ALLOCATION_MODE and args.folder not in {"PROJECTS", "ALL"}:
        raise ValueError("projects-labadi-v1 mode requires --folder PROJECTS or ALL")
    MATCHED.mkdir(parents=True, exist_ok=True)
    EXTRACT.mkdir(parents=True, exist_ok=True)

    engine = _load_v6_engine()
    lookups = engine.load_lookups()
    supplier_index = engine.load_expenses_format(Path(args.expenses_format), lookups)
    so_detail_index = engine.load_so_detail(Path(args.so_detail)) if args.so_detail else {}
    project_lookup = None
    if args.allocation_mode == PROJECT_ALLOCATION_MODE:
        if str(ROOT) not in sys.path:
            sys.path.insert(0, str(ROOT))
        from scripts.asateel_project_allocation import load_lookup
        project_lookup = load_lookup(Path(args.project_allocation_lookup))

    cache_tag = engine.pdf_dir_cache_tag(args.pdf_dir)
    files = engine.folder_files(args.folder, args.full, args.pdf_dir)
    input_fingerprints = engine.input_fingerprints(
        Path(args.expenses_format),
        Path(args.so_detail) if args.so_detail else None,
        [pdf_path for _, _, pdf_path in files],
    )
    input_fingerprints["project_allocation_lookup_json"] = (
        engine._file_fingerprint(Path(args.project_allocation_lookup))
        if args.allocation_mode == PROJECT_ALLOCATION_MODE
        else None
    )
    provenance = engine.provenance(args, input_fingerprints)
    extracted = []
    for idx, (folder, inv, pdf_path) in enumerate(files, start=1):
        print(f"[extract {idx}/{len(files)}] {folder} {inv}", flush=True)
        try:
            payload = engine.gemini_extract(pdf_path, folder, inv, lookups, force=args.refresh_cache, cache_tag=cache_tag)
            extracted.append({"folder": folder, "invoice_hint": inv, "pdf": str(pdf_path), "payload": payload})
        except Exception as exc:
            print(f"[extract error] {folder} {inv}: {exc}", flush=True)
            extracted.append({
                "folder": folder,
                "invoice_hint": inv,
                "pdf": str(pdf_path),
                "payload": {},
                "error": str(exc),
            })

    rows, trace = engine.build_rows(
        extracted,
        lookups,
        supplier_index,
        so_detail_index,
        allocation_mode=args.allocation_mode,
        project_lookup=project_lookup,
        project_master_fallback=args.folder == "PROJECTS",
    )
    validation = engine.validate(rows, lookups)
    engine.write_excel(rows, ORACLE_XLSX)
    header_diffs = engine.validate_output_headers(ORACLE_XLSX)

    invoice_records = _invoice_records(rows, trace)
    catches = _catch_records(invoice_records)
    summary = _summary(rows, invoice_records, catches, validation, header_diffs, args, input_fingerprints, provenance)

    trace.update({
        "production_entrypoint": str(Path(__file__).resolve()),
        "supplier_expenses_format_path": str(Path(args.expenses_format)),
        "so_detail_path": str(Path(args.so_detail)) if args.so_detail else "",
        "allocation_mode": args.allocation_mode,
        "project_allocation_lookup_path": (
            str(Path(args.project_allocation_lookup)) if args.allocation_mode == PROJECT_ALLOCATION_MODE else ""
        ),
        "input_fingerprints": input_fingerprints,
        "provenance": provenance,
        "validation": validation,
        "header_validation": summary["header_validation"],
        "output_files": {
            "oracle_xlsx": str(ORACLE_XLSX),
            "allocation_json": str(ALLOCATION_JSON),
            "catch_json": str(CATCH_JSON),
            "summary_json": str(SUMMARY_JSON),
        },
        "rows": [_row_public(r) for r in rows],
    })

    ALLOCATION_JSON.write_text(json.dumps(_json_safe(invoice_records), ensure_ascii=False, indent=2), encoding="utf-8")
    CATCH_JSON.write_text(json.dumps(_json_safe(catches), ensure_ascii=False, indent=2), encoding="utf-8")
    SUMMARY_JSON.write_text(json.dumps(_json_safe(summary), ensure_ascii=False, indent=2), encoding="utf-8")
    TRACE_JSON.write_text(json.dumps(_json_safe(trace), ensure_ascii=False, indent=2), encoding="utf-8")
    PDF_HEADERS_JSON.write_text(json.dumps(_json_safe(extracted), ensure_ascii=False, indent=2), encoding="utf-8")

    print("\nASATEEL PRODUCTION V6 SUMMARY")
    print("=============================")
    print(f"Approach: production wrapper delegates to {POC_PATH}")
    print(f"Invoices processed: {summary['invoice_count']}")
    print(f"Distribution rows written: {summary['allocation_lines']}")
    print(f"GREEN/YELLOW/RED rows: {summary['row_status_counts']}")
    print(f"Split methods: {summary['split_method_counts']}")
    print(f"Allocation mode: {summary['allocation_mode']}")
    if summary["project_lookup_status_counts"]:
        print(f"Project lookup statuses: {summary['project_lookup_status_counts']}")
    print(f"Reconciled/mismatched invoices: {summary['reconciled_invoices']}/{summary['mismatched_invoices']}")
    print(f"Exceptions by category: {summary['exceptions_by_category']}")
    print("\nOUTPUT FILES")
    print("============")
    print(f"Oracle XLSX: {ORACLE_XLSX}")
    print(f"Allocation JSON: {ALLOCATION_JSON}")
    print(f"Catch JSON: {CATCH_JSON}")
    print(f"Summary JSON: {SUMMARY_JSON}")
    print(f"Trace JSON: {TRACE_JSON}")
    return summary


def main(argv: list[str] | None = None) -> int:
    run(argv)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
