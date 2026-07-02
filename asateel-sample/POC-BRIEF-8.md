TASK: v5 — (A) make our "Additional Information" value match finance's exact format and score it as a compared field; (B) produce an EASY side-by-side "ours vs theirs" distribution workbook with full detail. EDIT mode for the format change: only modify asateel-sample/asateel_poc.py. The side-by-side is a NEW standalone script + new xlsx. Do NOT touch pipelines/, scripts/, deployed code. New output files only. Report; do not deploy.

=== CONFIRMED FACTS (operator-verified — use directly) ===
- Finance answer-key Entry sheets (asateel-sample/_allocation/Entry-1.xlsm, Entry-2.xlsm, sheet "Invoices", header row 8, data row 9+) store Additional Information in column EL (index 140), format: "<empno>.<JQ>" e.g. "1001017.JQ-26111081" and "1000699.JQ-26110785" (employee number, a DOT, then the JQ token). The full distribution string is in col CU (index 98), e.g. "03-20100-61500027-160014-170-10052-10071-00000-00-000000". Line amount in col CE (index 84). Invoice header number is on col H (index 7) of the header line, blank on continuation rows (forward-fill down). 
- OUR v4 output (asateel-sample/_poc_out/asateel-poc-oracle-CENTRAL-full-v4-2026-06-20.xlsx, sheet "Sheet", header row 3, data row 4+) currently has "Additional Information" at col AJ (index 35) formatted as "1001017 | JQ-26111081" (pipe + spaces). Distribution Combination is col N (index 13). Invoice col C, line amount col M, Employee No col P.

=== PART A: Additional Information format fix (edit asateel_poc.py) ===
1. Change the Additional Information value format to EXACTLY match finance: "<empno>.<JQ>" — employee number, a literal dot, then the JQ string, NO spaces, NO pipe. Example: "1001017.JQ-26111081".
   - Strip surrounding whitespace from empno and JQ (the supplier sheet has trailing spaces on some JQ values, e.g. "JQ-26109036 ").
   - Keep it ONE PER LINE (each distribution row carries its own line's empno.JQ), exactly as today.
   - If only empno is available, output just the empno; if only JQ, just the JQ; if neither, blank. (Match finance: their cell is "<empno>.<JQ>" when both exist.)
2. Re-run full CENTRAL reusing the Gemini cache (allocation/format-layer change only, no re-extraction):
     python3 asateel-sample/asateel_poc.py --folder CENTRAL --full --out-suffix CENTRAL-full-v5
   New outputs: asateel-poc-oracle-CENTRAL-full-v5-2026-06-20.xlsx + trace json. Do NOT overwrite v4.
3. Keep EVERYTHING ELSE from v4 unchanged: agency from supplier brand text, CC/DIV from Manpower, Solution from supplier text, Location=20100 all rows, multi-line capture, brand remap, A..AF header matches Jawal reference char-for-char, amount split unchanged.

=== PART B: easy side-by-side "ours vs theirs" workbook (NEW standalone script) ===
Create a new script (e.g. asateel-sample/build_sidebyside_v5.py) that reads the v5 output + Entry-1/Entry-2 + supplier + Manpower and writes asateel-sample/_poc_out/asateel-sidebyside-v5-2026-06-20.xlsx. This is meant to be SCANNED BY A HUMAN quickly, so layout matters:
- ONE ROW PER DISTRIBUTION LINE (matched by invoice + line order, amount within 0.01 fallback — same method as the v3/v4 compare). 
- Group/sort by invoice ascending, then line. Put a thin separator (or alternating invoice shading) between invoices so multi-line invoices read as a block.
- Columns, grouped with clear banner headers in row 1 (merged) and field names in row 2, data row 3+:
  [KEY] Invoice | Line | Description | Amount(ours) | Amount(theirs) |
  [OURS] Our Account | Our Location | Our Cost Center | Our DIV | Our Solution | Our Agency | Our Agency Name | Our Additional Info | Our Full Distribution |
  [THEIRS / FINANCE] Key Account | Key Location | Key Cost Center | Key DIV | Key Solution | Key Agency | Key Additional Info | Key Full Distribution |
  [MATCH] Agency✓ | CC✓ | DIV✓ | Solution✓ | Additional Info✓ | Full Combo✓ | Mismatch Fields |
  Derive ours segments from our col N split (Company-Location-Account-CostCenter-DIV-Solution-Agency-Project-Intercompany-Future) and finance segments from their col CU split (same positional layout — verify segment order/positions by inspecting a populated CU value against our N).
  For Additional Info✓: compare our (now dotted) value to finance col EL, case-insensitive, whitespace-stripped. 
- Highlight: green fill (#16A34A @15%) on MATCH ✓ cells that are Y, red fill (#DC2626 @15%) on the THEIRS cell when that field differs from OURS. Accord styling: Inter where settable, navy #1E40AF banner row white text, thin #E5E7EB borders, freeze panes at the data start and freeze the Invoice/Line columns so scrolling keeps context. Autofilter on the field-name row.
- Tabs:
  1. "Side by Side" — every matched line (the main deliverable).
  2. "Differences Only" — same columns, only rows with any mismatch.
  3. "Summary" — per-field hit rate incl. the NEW Additional Info match rate, plus totals (lines, matched, fully-identical lines). Note amount-split excluded from scoring per operator.
- Watch for the openpyxl perf trap: do NOT use random ws.cell() reads on read_only sheets; use iter_rows row iteration and bounded columns (the supplier/Entry macro sheets report very wide dims).

=== RE-SCORE ===
Also write asateel-sample/COMPARE-REPORT-v5-2026-06-20.md with v5 vs v4 hit rates including the new Additional Info field (Agency/CC/DIV/Solution/Additional-Info/full-combo/amount, N/total). Note: Location=20100 should be 208/208 — verify by reading our col R (index 17) directly (the v4 compare script had a column-index bug that misread Location as 0; do NOT repeat it — read col R / segment[1] of N).

=== REPORT (stdout) ===
- Confirm Additional Info now formatted "empno.JQ"; print 03041 + 03317 examples ours vs finance.
- New Additional Info match rate (lines where ours == finance EL).
- Confirm Agency/CC/DIV/Solution/full-combo unchanged from v4 (no regression).
- Side-by-side workbook path; rows in each tab.
- Final paths (v5 xlsx, side-by-side xlsx, compare report).

=== CONSTRAINTS ===
- Only edit asateel_poc.py for Part A; Part B + scoring are new files. No edits to pipelines/scripts/deployed. New outputs only. No deploy.
- Canonical lookup = Aljeel_Lookups-v2.xlsx; supplier input = Central-11-2026.xlsx "Expenses Format"; Entry-1/Entry-2 = answer key. Cloudflare gateway ONLY for any LLM call.
