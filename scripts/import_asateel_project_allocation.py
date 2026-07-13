#!/usr/bin/env python3
"""Generate the deterministic Asateel PROJECTS Labadi lookup JSON."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

try:
    from scripts.asateel_project_allocation import DEFAULT_LOOKUP_PATH, build_lookup, write_lookup
except ModuleNotFoundError:  # direct ``python scripts/...`` execution
    from asateel_project_allocation import DEFAULT_LOOKUP_PATH, build_lookup, write_lookup


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MASTER = ROOT / "qc" / "master-data" / "Aljeel_Lookups-v2.xlsx"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workbook", type=Path, help="Labadi source workbook (.xlsx)")
    parser.add_argument("--master", type=Path, default=DEFAULT_MASTER, help="Canonical AlJeel lookup workbook")
    parser.add_argument("--output", type=Path, default=DEFAULT_LOOKUP_PATH, help="Normalized JSON destination")
    parser.add_argument("--check", action="store_true", help="Fail if regenerated JSON differs; do not write")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    data = build_lookup(args.workbook, args.master)
    if args.check:
        expected = json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
        actual = args.output.read_text(encoding="utf-8") if args.output.exists() else ""
        if actual != expected:
            print(f"LOOKUP DRIFT: {args.output}")
            return 1
        print(f"LOOKUP OK: {args.output}")
    else:
        write_lookup(data, args.output)
        print(f"WROTE: {args.output}")
    print(json.dumps(data["statistics"], sort_keys=True))
    warnings = data["validation"]["warnings"]
    print(f"validation: errors=0 ambiguities=0 warnings={len(warnings)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
