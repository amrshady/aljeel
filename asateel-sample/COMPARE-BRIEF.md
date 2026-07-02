TASK: Run a COMPARISON / scoring of the v2 POC output against the finance team's provided answer-key files. READ-ONLY analysis — do NOT edit asateel_poc.py logic, do NOT change allocation, do NOT deploy. You MAY write a new standalone comparison script + a report file under asateel-sample/. Report findings.

INPUTS:
- Our generated output: asateel-sample/_poc_out/asateel-poc-oracle-CENTRAL-full-v2-2026-06-20.xlsx (sheet "Sheet", header row 3, data row 4+). Key cols: C=Invoice Number, M=line amount excl-VAT, N=Distribution Combination, U=Cost Center, W=DIV, AA=Agency code, AB=Agency Name, P=Employee No, plus debug cols (Additional Information, Allocation Source, etc).
- Answer key (finance-provided actual Oracle entries): asateel-sample/_allocation/Entry-1.xlsm and Entry-2.xlsm, sheet "Invoices", header row 8, data row 9+. These are the ADFDI "Create Invoices" uploads the finance team actually produced. The distribution/allocation detail (account/cost center/div/solution/agency segments) lives in the far-right columns — locate the Distribution Combination / segment columns by inspecting the header row 8 and the populated data cells (the combo string mirrors our col N format: Company-Location-Account-CostCenter-DIV-Solution-Agency-Project-Intercompany-Future). Entry-1 covers invoices ~03041 onward (header id 1..56), Entry-2 covers ~03170 onward (header id 57+).
- The POC already has load_answer_key() + a scoring path (around lines 1328-1600 of asateel_poc.py) that parses these Entry sheets and matches per invoice+line. REUSE that loader logic if convenient (import or copy), but the comparison SCRIPT must be new/standalone — do not modify the POC.

WHAT TO COMPARE (per matched invoice+line, ours vs answer key):
1. Agency code (AA) match
2. Cost Center (U) match
3. Division (W) match
4. Distribution Combination (N) full-string match
5. Line amount (M) within 0.01 tolerance
Match our rows to answer rows by Invoice Number + line order, falling back to amount. Note any invoices present in ours but missing from the key (and vice versa).

REPORT (write to asateel-sample/COMPARE-REPORT-2026-06-20.md AND print summary to stdout):
- Overall hit rates: Agency %, CostCenter %, DIV %, full-combo %, amount % — across all matchable lines, with N matched / N total.
- Coverage: how many invoices/lines in ours have a corresponding answer-key row; list invoices in one but not the other.
- A MISMATCH TABLE: invoice | line | field | ours | answer-key, for every disagreement on Agency/CC/DIV (cap at ~60 rows, note total count).
- Breakdown of mismatches by Allocation Source (brand / salesperson / supplier_expenses_format / none) so we see which path is weakest.
- Specifically report 03317's three lines vs the key.
- Honest assessment: top systematic error patterns and what input/rule would close them.

CONSTRAINTS:
- READ-ONLY on asateel_poc.py and all pipeline/deployed code. New comparison script + report file only. No deploy.
- Canonical lookup = Aljeel_Lookups-v2.xlsx; Entry sheets are the answer key.
