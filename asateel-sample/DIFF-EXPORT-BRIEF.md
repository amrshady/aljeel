TASK: Build a standalone Python script that produces a DOWNLOADABLE Excel workbook of the differences between OUR v3 output and the FINANCE answer key (Entry-1/Entry-2), enriched with the Manpower lookup details, so a human can see ours vs booked side-by-side. READ-ONLY on pipeline code: do NOT modify asateel_poc.py, pipelines/, scripts/, or deployed code. You MAY create a NEW script + the output xlsx under asateel-sample/. Report; do not deploy.

INPUTS:
- OUR output: asateel-sample/_poc_out/asateel-poc-oracle-CENTRAL-full-v3-2026-06-20.xlsx (sheet "Sheet", header row 3, data row 4+). Relevant cols: C=Invoice Number, K=Description, M=line amount, N=Distribution Combination, P=Employee No, S=Account, U=Cost Center, V=Cost Name, W=DIV, X=Contribution, Y=Solution, Z=Solution Name, AA=Agency code, AB=Agency Name, plus debug cols incl "Additional Information" (empno | JQ), "Allocation Source", "Extracted Brand(s)", "Extracted Salesperson", "Reference(المرجع)", "Notes". Also the v3 trace json alongside it (asateel-poc-trace-CENTRAL-full-v3-2026-06-20.json) if richer per-line fields help.
- FINANCE answer key: asateel-sample/_allocation/Entry-1.xlsm and Entry-2.xlsm, sheet "Invoices", header row 8, data row 9+. Locate the distribution/segment columns by inspecting header row 8 + populated cells (combo string mirrors our col N format Company-Location-Account-CostCenter-DIV-Solution-Agency-Project-Intercompany-Future). Entry-1 = invoices from ~03041 (header id 1..56), Entry-2 = ~03170 (id 57+).
- SUPPLIER sheet: asateel-sample/_allocation/Central-11-2026.xlsx, sheet "Expenses Format" (data row 9+): col N(idx13)=Invoice Number (forward-fill down for multi-line), X(idx23)=#Of JQ, Y(idx24)=Employee Name, AO(idx40)=Employee Number, AF/AG/AI/AJ = supplier's own Agency/Division/Solution/CostCenter text, AK=AMOUNT.
- MANPOWER master: qc/master-data/Aljeel_Lookups-v2.xlsx, sheet "Manpower". Cols: A(0)=Emp No, C(2)=Name, I(8)=DIV code, J(9)=New Division, K(10)=Agency code, L(11)=Agency name, M(12)=Cost Center code, N(13)=Cost Center name, O(14)=Allocation status flag ("Can Be used"/"Need to allocate"/charge-to), P(15)=Solution. Build empno->row and name->row indexes (no duplicate empnos/names exist).

MATCHING: match our rows to answer-key rows by Invoice Number then line order; fall back to amount within 0.01 (same method as COMPARE-REPORT-v3). For each of our lines also resolve the employee: prefer supplier-sheet Employee Number for that invoice+line; if blank, use the supplier Employee Name; then join into Manpower.

OUTPUT WORKBOOK: asateel-sample/_poc_out/asateel-diff-vs-finance-v3-2026-06-20.xlsx — Accord-branded styling (Inter font where settable, navy #1E40AF header fill white text, thin #E5E7EB borders, RED fill #DC2626 @15% on mismatched cells). Sheets:
1. "Differences" — ONE ROW PER OUR-LINE THAT DISAGREES with the key on Agency OR Cost Center OR DIV OR Solution OR full-combo. Columns, in this order:
   Invoice | Line | Description | Amount | Allocation Source | Employee No | Employee Name |
   [MANPOWER LOOKUP:] MP Emp Found(Y/N) | MP Name | MP Agency Code | MP Agency Name | MP DIV | MP New Division | MP Cost Center | MP CC Name | MP Solution | MP Alloc Flag |
   [OURS:] Our Agency | Our Agency Name | Our CC | Our DIV | Our Solution | Our Full Combo |
   [BOOKED (FINANCE):] Key Agency | Key CC | Key DIV | Key Solution | Key Full Combo |
   [DELTA:] Agency Match | CC Match | DIV Match | Solution Match | Combo Match (Y/N each) | Mismatch Fields (comma list) |
   Extracted Brand(s) | Notes.
   Highlight (RED 15% fill) each cell in the OURS block that differs from the BOOKED block. Sort by Mismatch-field count desc, then Invoice.
2. "All Lines" — same columns but EVERY matched line (agree + disagree), so they can filter themselves.
3. "Summary" — counts: total lines, matched lines, # disagreeing on each field (Agency/CC/DIV/Solution/Combo), and a small table of the top recurring (Our Agency -> Key Agency) substitutions with counts and an example invoice each. Also a row noting amount-split is intentionally excluded from the diff per operator decision (but still show Amount column for context).
   Where the same employee's Manpower home agency != finance booked agency, that is the known root cause — add a column/flag "HomeAgencyVsBrand" = Y when MP Agency Code == Our Agency != Key Agency (i.e. we used the rep's home agency but finance booked a different/brand agency).

REPORT (stdout):
- Rows in Differences sheet; breakdown by field; top 10 (ours->booked) agency substitutions with counts; how many diffs are the HomeAgencyVsBrand pattern; how many lines had no Manpower match (blank empno+name miss); final xlsx path.

CONSTRAINTS: New script + new xlsx only. No edits to asateel_poc.py/pipelines/scripts/deployed. Canonical lookup = Aljeel_Lookups-v2.xlsx; Entry sheets = answer key. No deploy.
