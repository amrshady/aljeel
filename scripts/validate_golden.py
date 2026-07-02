#!/usr/bin/env python3
"""Validate pipeline output against golden v2 fixtures for both batches."""
import sys
import json
from pathlib import Path
import pandas as pd

ROOT = Path("/home/clawdbot/.openclaw/workspace/aljeel")

SEGMENT_WIDTHS = [2, 5, 8, 6, 3, 5, 5, 5, 2, 6]
SEGMENT_NAMES = ["Co", "Loc", "Acc", "CC", "DIV", "Sol", "Ag", "Proj", "IC", "F1"]

def load_combos_from_oracle_template(xl_path):
    """Load combos from an Oracle template format file."""
    df = pd.read_excel(xl_path, sheet_name=0, header=None)
    header_row = None
    for i in range(10):
        if "Invoice Header Identifier" in str(df.iloc[i, 0]):
            header_row = i
            break
    if header_row is None:
        raise ValueError(f"No header row found in {xl_path}")
    
    combos = []
    for i in range(header_row + 1, len(df)):
        if pd.isna(df.iloc[i, 0]):
            continue
        combo = str(df.iloc[i, 13]) if pd.notna(df.iloc[i, 13]) else ""
        combos.append(combo)
    return combos

def compare_batches(batch_name, golden_path, current_path):
    """Compare current pipeline output against golden fixture."""
    golden = load_combos_from_oracle_template(golden_path)
    current = load_combos_from_oracle_template(current_path)
    
    n = min(len(golden), len(current))
    exact = 0
    loc_only = 0
    diffs = []
    
    for i in range(n):
        if golden[i] == current[i]:
            exact += 1
        else:
            g_segs = golden[i].split("-")
            c_segs = current[i].split("-")
            diff_segs = []
            for sn, gs, cs in zip(SEGMENT_NAMES, g_segs, c_segs):
                if gs != cs:
                    diff_segs.append(f"{sn}:{gs}->{cs}")
            diff_names = set(d.split(":")[0] for d in diff_segs)
            if diff_names == {"Loc"}:
                loc_only += 1
            diffs.append({"line": i+1, "diffs": diff_segs})
    
    pct = 100 * exact / max(n, 1)
    return {
        "batch": batch_name,
        "golden_lines": len(golden),
        "current_lines": len(current),
        "compared": n,
        "exact_matches": exact,
        "exact_pct": round(pct, 1),
        "loc_only_drifts": loc_only,
        "other_diffs": len(diffs) - loc_only,
        "regressions": diffs,
    }

def main():
    v2_dir = ROOT / "qc" / "fixtures" / "v2"
    results = []
    
    for batch_id in ["j640", "j788"]:
        golden_dir = v2_dir / batch_id
        golden_files = list(golden_dir.glob("Spreadsheet-*-FILLED-*.xlsx"))
        if not golden_files:
            print(f"SKIP: No golden fixture for {batch_id}")
            continue
        golden_path = golden_files[0]
        
        batch_name = f"J26-{batch_id[1:]}"
        batch_dir = ROOT / "batches" / f"jawal-{batch_name}"
        # --- Fix 1 v15: Pick the latest FILLED file by mtime, excluding v7-validated golden snapshots and archive/ subdirs
        all_output_files = [
            p for p in batch_dir.glob("output/Spreadsheet-*-FILLED-*.xlsx")
            if "archive" not in str(p.parent)
            and "v7-validated" not in p.name
        ]
        if not all_output_files:
            print(f"SKIP: No current output for {batch_name}")
            continue
        # Pick the newest by mtime
        current_path = max(all_output_files, key=lambda p: p.stat().st_mtime)
        print(f"[validator] {batch_name}: using current file: {current_path.name}")
        
        result = compare_batches(batch_name, golden_path, current_path)
        results.append(result)
        
        status = "PASS" if result["exact_pct"] >= 95 else "CHECK"
        if result["other_diffs"] > 0:
            status = "REGRESSED" if result["other_diffs"] > 5 else "CHECK"
        
        print(f"[{status}] {batch_name}: {result['exact_matches']}/{result['compared']} exact ({result['exact_pct']}%), "
              f"{result['loc_only_drifts']} loc-only, {result['other_diffs']} other diffs")
    
    # Write JSON summary
    out_path = ROOT / "qc" / "fixtures" / "v2" / "validation-results.json"
    with open(out_path, "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults: {out_path}")

if __name__ == "__main__":
    main()
