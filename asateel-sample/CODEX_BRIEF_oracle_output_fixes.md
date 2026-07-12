# Task: Fix Asateel Oracle upload output (5 changes)

Target file: `/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py`
(This is the maintained allocation engine; `pipelines/asateel.py` delegates to it.)

Reference sheet from Mohammed Labadi (projects-16, hand-corrected):
`/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/labadi-projects16-reference.xlsx`
- Sheet "Sheet". Row 3 = Oracle Fusion headers. Data starts row 4.
- Col A = `*Invoice Header Identifier`, C = `*Invoice Number`, E = `*Invoice Amount`,
  F = `*Invoice Date`, AL(38)/AM(39) = `Additional Information`, AN(40) = `Correct` (Labadi's
  hand-corrected Additional Information — use as the target format for change #5).

Study `write_excel()` (~line 2227), `build_rows()` (~line 1648), `_additional_info()` (~line 1550),
`_canonical_jq()` / `_split_jqs()` (~line 1147-1175), and the SO_Detail loader (~line 1279) and
supplier Expenses Format loader (~line 1415).

## Required changes

### 1. Invoice serial in Column A (`*Invoice Header Identifier`)
Currently hardcoded to `1` for every row. It must be a per-invoice serial that increments by
unique invoice number: first invoice = 1, second = 2, etc.

### 2. Split invoices share the same identifier
All output rows belonging to the SAME invoice number (multi-JQ / multi-line splits) must carry the
SAME Column-A serial (see reference: invoice 03912 rows 4-5 both = 1; 03924 rows 18-21 all = 10).
Column C (`*Invoice Number`) already repeats per split row — keep that.

### 3. Amount + Date only on the first row of each invoice
`*Invoice Amount` (E) and `*Invoice Date` (F) must be populated ONLY on the first row instance of
each invoice; subsequent split rows of the same invoice must be blank/empty (see reference rows
5, 9, 11, 19-21 — E and F are empty). Line-level `*Amount` (col N) stays per row as-is.

### 4. Date format MM/DD/YYYY
`*Invoice Date` must be formatted as month/day/year (e.g. 06/17/2026). Check whether the Jawal
template forces a number_format on that cell; set the value/format so it renders MM/DD/YYYY.

### 5. (Hard) Additional Information JQ must mirror the JQ sheet's native format
Current `_additional_info()` outputs `emp_no.jq` where jq is the canonical `JQ-00000000` form from
`_canonical_jq()` (zero-padded, forced `JQ-` prefix). Labadi's `Correct` column shows the JQ part
must be rendered EXACTLY as it is stored in the JQ sheet:
  - Most rows: bare number, no prefix, no padding (e.g. `1001982.260004279`, not `...JQ-260004279`).
  - Some rows keep the prefix (e.g. `1000182.JQ-26110849`) because that is how it lives in the sheet.
So: match the JQ using the existing canonical search logic (which already works with/without prefix
and padding — DO NOT break that), but for the OUTPUT string use the raw JQ token exactly as it
appears in the source JQ sheet when a match is found. If no match is found in the sheet, fall back
to the extracted/canonical value unchanged.
  - Identify which sheet is authoritative for the JQ's native rendering (SO_Detail `ORDER_NUMBER`
    and/or the supplier Expenses Format JQ column). Build a `canonical_jq -> raw_jq_as_in_sheet`
    map at load time and use it only for the display/output string.
  - Do NOT change the employee-number portion (Amr confirms emp + JQ are matched correctly; only the
    JQ text format is wrong). Ignore any employee-number differences in the reference `Correct`
    column — those were separate manual edits, out of scope.

## Constraints
- Do not regress the Asateel golden gate: after changes, `python3 qc/asateel_golden_check.py` must
  still print `GOLDEN OK` (run from the aljeel workspace root).
- Report the diff and the golden-check result. DO NOT deploy or overwrite any batch outputs.
- If a design choice is ambiguous (esp. #5 source-of-truth sheet), state the assumption you made.
