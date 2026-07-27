#!/usr/bin/env python3
"""P&T managed-table adapter around the existing PROJECTS lookup implementation."""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from typing import Any


def paths() -> tuple[Path, Path, Path]:
    aljeel = Path(__file__).resolve().parents[4] / "aljeel"
    return (
        aljeel / "scripts" / "asateel_project_allocation.py",
        aljeel / "qc" / "master-data" / "Aljeel_Lookups-v2.xlsx",
        aljeel / "pipelines" / "lookups" / "asateel_projects_labadi_v1.json",
    )


def allocation_module() -> Any:
    module_path, _, _ = paths()
    spec = importlib.util.spec_from_file_location("asateel_project_allocation", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load allocation module: {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def source_cells(agency_index: int, head_index: int | None = None, junior_index: int | None = None) -> dict[str, str]:
    if head_index is None:
        row = agency_index + 5
        return {"agency": f"F{row}", "employee_name": f"G{row}", "employee_no": f"H{row}"}
    head_row = (15, 19, 23)[head_index] if head_index < 3 else 27 + (head_index - 3) * 4
    if junior_index is None:
        return {"employee_name": f"H{head_row}", "employee_no": f"I{head_row}"}
    column = chr(ord("I") + junior_index)
    return {"employee_name": f"{column}{head_row + 1}", "employee_no": f"{column}{head_row + 2}"}


def resolve_snapshot(snapshot: dict[str, Any]) -> dict[str, Any]:
    module = allocation_module()
    _, master_path, _ = paths()
    agencies, employees, aliases, _ = module._master_indexes(master_path)
    errors: list[str] = []
    warnings: list[str] = []
    resolved: list[dict[str, Any]] = []
    for row in snapshot.get("agencies", []):
        agency_code = module._unique_alias(aliases, row.get("agencyName", ""), "agency", errors)
        agency = agencies.get(agency_code)
        result = {**row, "agencyCode": agency_code}
        if row.get("resolutionMode") == "AGENCY":
            manager_no = module.code(row.get("managerEmpNo"))
            manager = employees.get(manager_no)
            if not manager:
                errors.append(f"manager employee {manager_no!r} is absent from Manpower")
            else:
                result["managerName"] = manager["employee_name"]
                result["managerEmpNo"] = manager_no
                if manager["home_agency_code"] != agency_code and agency:
                    warnings.append(
                        f"{agency_code} {agency['name']}: designated manager {manager_no} has Manpower home agency "
                        f"{manager['home_agency_code']} {manager['home_agency_name']}"
                    )
        salesmen: list[dict[str, Any]] = []
        for salesman in row.get("salesmen", []):
            head_no = module.code(salesman.get("lineHeadEmpNo"))
            junior_no = module.code(salesman.get("salesmanEmpNo"))
            head = employees.get(head_no)
            junior = employees.get(junior_no)
            if not head:
                errors.append(f"line head employee {head_no!r} is absent from Manpower")
            if not junior:
                errors.append(f"salesman employee {junior_no!r} is absent from Manpower")
            salesmen.append({
                **salesman,
                "lineHeadEmpNo": head_no,
                "lineHeadName": head["employee_name"] if head else salesman.get("lineHeadName", ""),
                "salesmanEmpNo": junior_no,
                "salesmanName": junior["employee_name"] if junior else salesman.get("salesmanName", ""),
            })
        result["salesmen"] = salesmen
        resolved.append(result)
    return {"agencies": resolved, "warnings": sorted(set(warnings)), "errors": errors}


def build(snapshot: dict[str, Any]) -> dict[str, Any]:
    module = allocation_module()
    _, master_path, _ = paths()
    validation = resolve_snapshot(snapshot)
    if validation["errors"]:
        raise module.ProjectLookupValidationError("; ".join(validation["errors"]))
    agencies, employees, _, _ = module._master_indexes(master_path)
    rules: list[dict[str, Any]] = []
    direct_index = 0
    for row in validation["agencies"]:
        canonical = agencies[row["agencyCode"]]
        if row["resolutionMode"] == "AGENCY":
            manager = employees[row["managerEmpNo"]]
            rules.append({
                "agency_code": row["agencyCode"], "agency_name": canonical["name"],
                "agency_aliases": sorted(set([row["agencyName"], canonical["name"]]), key=lambda value: (module.normalize_alias(value), value)),
                "employee_strategy": "agency_manager",
                "manager": {"employee_no": row["managerEmpNo"], "employee_name": manager["employee_name"],
                            "employee_aliases": sorted(set([row["managerName"], manager["employee_name"]]), key=lambda value: (module.normalize_alias(value), value))},
                "source_cells": source_cells(direct_index),
            })
            direct_index += 1
        else:
            grouped: dict[tuple[str, str], list[dict[str, Any]]] = {}
            for salesman in row["salesmen"]:
                grouped.setdefault((salesman["lineHeadEmpNo"], salesman["lineHeadName"]), []).append(salesman)
            heads = []
            for hi, ((head_no, head_name), juniors) in enumerate(grouped.items()):
                head = employees[head_no]
                heads.append({
                    "employee_no": head_no, "employee_name": head["employee_name"],
                    "employee_aliases": sorted(set([head_name, head["employee_name"]]), key=lambda value: (module.normalize_alias(value), value)),
                    "source_cells": source_cells(0, hi),
                    "juniors": [{
                        "employee_no": junior["salesmanEmpNo"],
                        "employee_name": employees[junior["salesmanEmpNo"]]["employee_name"],
                        "employee_aliases": sorted(set([junior["salesmanName"], employees[junior["salesmanEmpNo"]]["employee_name"]]), key=lambda value: (module.normalize_alias(value), value)),
                        "source_cells": source_cells(0, hi, ji),
                    } for ji, junior in enumerate(juniors)],
                })
            rules.append({
                "agency_code": row["agencyCode"], "agency_name": canonical["name"],
                "agency_aliases": sorted(set([row["agencyName"], canonical["name"]]), key=lambda value: (module.normalize_alias(value), value)),
                "employee_strategy": "bmx_junior_to_head", "heads": heads,
                "source_cells": {"agency": "F14", "instruction": "G14"},
            })
    rules.sort(key=lambda rule: rule["agency_code"])
    employees_used = {
        employee["employee_no"]
        for rule in rules
        for employee in ([rule["manager"]] if rule["employee_strategy"] == "agency_manager" else
                         [person for head in rule["heads"] for person in [head, *head["juniors"]]])
    }
    canonical_source = json.dumps(validation["agencies"], ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    return {
        "schema_version": module.SCHEMA_VERSION, "mode": module.MODE,
        "description": "Labadi workbook allocation override for Asateel PROJECTS invoices only",
        "provenance": {
            "source_label": "P&T managed database tables", "source_sha256": hashlib.sha256(canonical_source).hexdigest(),
            "source_size_bytes": len(canonical_source), "source_sheet": "managed-table",
            "source_cells": ["PtAgencyMapping", "PtSalesmanMapping"],
            "master_label": "qc/master-data/Aljeel_Lookups-v2.xlsx", "master_sha256": sha256(master_path),
            "master_size_bytes": master_path.stat().st_size,
        },
        "precedence": [
            "project mode applies only when invoice folder is PROJECTS", "agency: canonical code exact match",
            "agency: unique normalized alias exact match", "non-BMX employee: workbook manager selected by resolved agency",
            "BMX employee: exact junior/head code, then unique normalized employee-name alias",
            "unknown, conflicting, or ambiguous input: no guessed employee; emit project lookup review",
        ],
        "statistics": {
            "agency_rules": len(rules),
            "direct_agency_manager_rules": sum(r["employee_strategy"] == "agency_manager" for r in rules),
            "bmx_heads": sum(len(r.get("heads", [])) for r in rules),
            "bmx_junior_to_head_rules": sum(len(h["juniors"]) for r in rules for h in r.get("heads", [])),
            "referenced_employee_codes": len(employees_used),
        },
        "validation": {"errors": [], "ambiguities": [], "warnings": validation["warnings"]},
        "agency_rules": rules,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("resolve", "build", "validate"))
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    module = allocation_module()
    payload = json.load(sys.stdin) if args.command != "validate" else None
    if args.command == "resolve":
        result = resolve_snapshot(payload)
    elif args.command == "build":
        result = build(payload)
        if not args.output:
            raise ValueError("--output is required")
        module.write_lookup(result, args.output)
        module.load_lookup(args.output)
    else:
        _, _, lookup_path = paths()
        result = module.load_lookup(args.output or lookup_path)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
