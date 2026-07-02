# Change Log - Consolidated Rerun (2026-05-21)

## New Files Created
- `batches/jawal-J26-640/` — new batch directory with Oracle template
  - `Spreadsheet.xlsx` / `Spreadsheet-v4-input.xlsx` — generated from J26-640.xlsx Details sheet
  - `raw/` → symlink to `archive/raw-J26-640/24-30apr/`
  - `output/Spreadsheet-J26-640-FILLED-v7-validated.xlsx` — pipeline output (25KB)
  - `output/summary-v7-validated.json` — batch summary
- `batches/jawal-J26-788/output/Spreadsheet-J26-788-FILLED-v7-validated-rerun.xlsx` — rerun output
- `batches/jawal-J26-788/output/summary-v7-validated-rerun.json` — rerun summary
- `qc/fixtures/v2/j640/` — promoted golden fixture from pipeline output
- `qc/fixtures/v2/j788/` — promoted golden fixture from pipeline output
- `qc/reports/2026-05-21-consolidated-rerun/` — all report files
  - `consolidated-rollup.md` — main cross-batch summary
  - `per-batch-comparison.md` — side-by-side metrics
  - `fusion-mapping-empirical-v2.md` — refreshed Fusion-Manpower code mapping
  - `j640-pipeline-vs-golden.md` — output match analysis
  - `j640-pipeline-vs-golden.json` — raw comparison data
  - `change-log.md` — this file

## Modified Files
- `scripts/validate_golden.py` — updated to validate against v2 fixtures for both batches

## Oracle Template Generation (J26-640)
The J26-640 batch was provided only as a raw travel agency invoice (J26-640.xlsx).
Unlike J26-788 (which came with a pre-filled Oracle Fusion upload template),
J26-640 required conversion from the Details sheet into the Oracle template format.

Key mapping decisions:
- Ticket numbers: extracted last 10 digits from raw ticket (e.g., '065 6905264364' -> '6905264364')
- Employee numbers: most lines had '-' (no emp no), so pipeline relied on name_fuzzy matching
- Preliminary Distribution Combination: set from Account.CostCenter columns in Details sheet
- Description: formatted as 'PASSENGER - ROUTE (TICKET10)' to match J26-788 format

## Pipeline Run Summary
- J26-640: 117 lines, 0 hard failures, 117 soft flags
  - 45 employees found (39 name_fuzzy + 6 emp_no_direct), 72 not found
  - 43 email forms parsed, 74 FORM_NOT_FOUND_IN_EMAIL
- J26-788 rerun: 103 lines, identical to original v7-validated output
- Golden cross-check: 82.2% match for found employees (20.0% exact + 62.2% location-only drift)