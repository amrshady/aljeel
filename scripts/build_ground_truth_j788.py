#!/usr/bin/env python3
"""
Build J26-788 ground truth from:
  - Labadi corrections (rows he flagged)
  - v26 output for rows he did NOT flag

Usage: python3 scripts/build_ground_truth_j788.py
Output: batches/jawal-J26-788/output/J26-788-GROUND-TRUTH.xlsx
"""
import pandas as pd
from pathlib import Path
import shutil, openpyxl

BATCH_DIR = Path("/home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-788")
V26_PATH  = BATCH_DIR / "output" / "Spreadsheet-J26-788-FILLED-v26.xlsx"
OUT_PATH  = BATCH_DIR / "output" / "J26-788-GROUND-TRUTH.xlsx"

# ── Labadi corrections (from review portal analysis + step trace) ──────────────
# Format: key=ticket/26-NNN, value=dict of field corrections.
# Only fields that Labadi explicitly corrected are listed.
# Reference: Labadi flagged file + session conversation 2026-06-05
LABADI_CORRECTIONS = {
    # ALBASIRI — emp, CC, agency wrong (DMS/Ansell vs Contribution/Abbott)
    "6905428831": {
        "Employee No": "1000433",
        "Account":     "60307021",
        "Cost Center": "160014",
        "DIV":         "170",
        "Solution":    "10049",
        "Agency":      "10072",
        # Labels
        "GL":            "Sponsoring Expenses",
        "Cost Name":     "Contribution",
        "Contribution":  "Contribution",
        "Solution Name": "EP",
        "Agency Name":   "Abbott",
    },
    # AHMED MOHAMED — emp wrong, account 21070229 disputed; Labadi showed 21070229
    # with Contribution/Abbott segments
    "6905428854": {
        "Employee No": "1000640",
        "Account":     "21070229",
        "Cost Center": "160014",
        "DIV":         "170",
        "Solution":    "10049",
        "Agency":      "10072",
        "GL":            "Accrued Employee Annual Tickets",
        "Cost Name":     "Contribution",
        "Contribution":  "Contribution",
        "Solution Name": "EP",
        "Agency Name":   "Abbott",
    },
    # SALEH family — emp/account correct; Labadi expects all-General segments
    "6905478428": {
        "Employee No": "",   # blank for PC (family ticket)
        "Account":     "21070229",
        "Cost Center": "000000",
        "DIV":         "000",
        "Solution":    "00000",
        "Agency":      "00000",
        "GL":            "Accrued Employee Annual Tickets",
        "Cost Name":     "General",
        "Contribution":  "General",
        "Solution Name": "General",
        "Agency Name":   "General",
    },
    "6905478429": {
        "Employee No": "1002066",
        "Account":     "21070229",
        "Cost Center": "000000",
        "DIV":         "000",
        "Solution":    "00000",
        "Agency":      "00000",
        "GL":            "Accrued Employee Annual Tickets",
        "Cost Name":     "General",
        "Contribution":  "General",
        "Solution Name": "General",
        "Agency Name":   "General",
    },
    "6905478431": {
        "Employee No": "",
        "Account":     "21070229",
        "Cost Center": "000000",
        "DIV":         "000",
        "Solution":    "00000",
        "Agency":      "00000",
        "GL":            "Accrued Employee Annual Tickets",
        "Cost Name":     "General",
        "Contribution":  "General",
        "Solution Name": "General",
        "Agency Name":   "General",
    },
    # MOSTAFA AMER hotels — Labadi wants 21070229 + employee allocation
    "26-731": {
        "Employee No": "1002091",
        "Account":     "21070229",
        "Cost Center": "160012",
        "DIV":         "194",
        "Solution":    "00000",
        "Agency":      "10200",
        "GL":            "Accrued Employee Annual Tickets",
        "Cost Name":     "IVD Solutions",
        "Contribution":  "IVD Solutions",
        "Solution Name": "General",
        "Agency Name":   "S&M",
    },
    "26-732": {
        "Employee No": "1002091",
        "Account":     "21070229",
        "Cost Center": "160012",
        "DIV":         "194",
        "Solution":    "00000",
        "Agency":      "10200",
        "GL":            "Accrued Employee Annual Tickets",
        "Cost Name":     "IVD Solutions",
        "Contribution":  "IVD Solutions",
        "Solution Name": "General",
        "Agency Name":   "S&M",
    },
    # SULTAN ABU DOGHMEH hotels
    "26-733": {
        "Employee No": "1000995",
        "Account":     "21070229",
        "Cost Center": "160012",
        "DIV":         "194",
        "Solution":    "00000",
        "Agency":      "10200",
        "GL":            "Accrued Employee Annual Tickets",
        "Cost Name":     "IVD Solutions",
        "Contribution":  "IVD Solutions",
        "Solution Name": "General",
        "Agency Name":   "S&M",
    },
    "26-734": {
        "Employee No": "1000995",
        "Account":     "21070229",
        "Cost Center": "160012",
        "DIV":         "194",
        "Solution":    "00000",
        "Agency":      "10200",
        "GL":            "Accrued Employee Annual Tickets",
        "Cost Name":     "IVD Solutions",
        "Contribution":  "IVD Solutions",
        "Solution Name": "General",
        "Agency Name":   "S&M",
    },
    # KONDO — emp/account correct, all-General segments
    "6905569429": {
        "Employee No": "1000575",
        "Account":     "21070229",
        "Cost Center": "000000",
        "DIV":         "000",
        "Solution":    "00000",
        "Agency":      "00000",
        "GL":            "Accrued Employee Annual Tickets",
        "Cost Name":     "General",
        "Contribution":  "General",
        "Solution Name": "General",
        "Agency Name":   "General",
    },
    # ABEER BAKHSH 26-744 — emp wrong, account correct
    "26-744": {
        "Employee No": "1002483",
        "Account":     "60301003",
        "Cost Center": "160014",
        "DIV":         "170",
        "Solution":    "10050",
        "Agency":      "10072",
        "GL":            "Travel Tickets Expense",
        "Cost Name":     "Contribution",
        "Contribution":  "Contribution",
        "Solution Name": "HF",
        "Agency Name":   "Abbott",
    },
    # AMMAR CHAUDHARY 26-743 — emp wrong, account correct (60308009 Training)
    "26-743": {
        "Employee No": "1000820",
        "Account":     "60308009",
        "Cost Center": "160014",
        "DIV":         "170",
        "Solution":    "10050",
        "Agency":      "10072",
        "GL":            "Training Expenses",
        "Cost Name":     "Contribution",
        "Contribution":  "Contribution",
        "Solution Name": "HF",
        "Agency Name":   "Abbott",
    },
}

SCORE_FIELDS = ["Employee No", "Account", "Cost Center", "DIV", "Solution", "Agency"]
HEADER_ROW = 3  # 1-indexed, row 3 has headers in these spreadsheets

def extract_ticket_key(description: str) -> str:
    """Extract ticket number or 26-NNN from description."""
    import re
    # Try IATA ticket number
    m = re.search(r"\b(\d{10,})\b", str(description))
    if m:
        return m.group(1)
    # Try 26-NNN
    m2 = re.search(r"\b(26-\d{3,})\b", str(description), re.IGNORECASE)
    if m2:
        return m2.group(1).upper()
    return ""

def main():
    print(f"Loading v26 output: {V26_PATH}")
    wb = openpyxl.load_workbook(V26_PATH)
    ws = wb.active

    # Build header map from row 3
    headers = [str(c.value).strip() if c.value else "" for c in ws[HEADER_ROW]]
    col_map = {h: i+1 for i, h in enumerate(headers) if h}

    desc_col = col_map.get("Description") or col_map.get("*Description")
    if not desc_col:
        # Try fuzzy
        for h, c in col_map.items():
            if "description" in h.lower():
                desc_col = c
                break

    if not desc_col:
        print("ERROR: Could not find Description column")
        print("Available headers:", list(col_map.keys())[:20])
        return

    corrections_applied = 0
    rows_scanned = 0

    for row in ws.iter_rows(min_row=HEADER_ROW + 1):
        desc_cell = row[desc_col - 1]
        desc = str(desc_cell.value or "")
        if not desc.strip():
            continue

        rows_scanned += 1
        ticket = extract_ticket_key(desc)
        if not ticket:
            continue

        correction = LABADI_CORRECTIONS.get(ticket)
        if not correction:
            continue

        # Apply each correction field
        for field, value in correction.items():
            if field in col_map:
                ws.cell(row=desc_cell.row, column=col_map[field], value=value)

        # Rebuild Distribution Combination
        combo_col = next((col_map[h] for h in col_map if "distribution combination" in h.lower()), None)
        if combo_col:
            co = "03"
            loc = str(ws.cell(row=desc_cell.row, column=col_map.get("Location", 0)).value or "20100") or "20100"
            acct = str(correction.get("Account", ws.cell(row=desc_cell.row, column=col_map.get("Account", 0)).value or ""))
            cc   = str(correction.get("Cost Center", "000000")).zfill(6)
            div  = str(correction.get("DIV", "000")).zfill(3)
            sol  = str(correction.get("Solution", "00000")).zfill(5)
            ag   = str(correction.get("Agency", "00000")).zfill(5)
            new_combo = f"{co}-{loc.zfill(5)}-{acct.zfill(8)}-{cc}-{div}-{sol}-{ag}-00000-00-000000"
            ws.cell(row=desc_cell.row, column=combo_col, value=new_combo)

        # Rebuild GL Description
        gl_col = col_map.get("GL Description")
        if gl_col:
            def _c(v): return v.strip() if v and v.strip() and v.strip() != "#N/A" else "—"
            gl_desc = " · ".join([
                _c(correction.get("GL", "")),
                _c(correction.get("Cost Name", "")),
                _c(correction.get("Contribution", "")),
                _c(correction.get("Solution Name", "")),
                _c(correction.get("Agency Name", "")),
            ]) + " · 00000 · 00 · 000000"
            ws.cell(row=desc_cell.row, column=gl_col, value=gl_desc)

        corrections_applied += 1
        print(f"  [GT] Applied correction to ticket {ticket} (row {desc_cell.row}): {desc[:60]}")

    wb.save(OUT_PATH)
    print(f"\nDone. {rows_scanned} rows scanned, {corrections_applied} corrections applied.")
    print(f"Ground truth written to: {OUT_PATH}")

if __name__ == "__main__":
    main()
