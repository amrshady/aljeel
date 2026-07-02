TASK: Rewrite the Asateel POC Excel WRITER so its output matches the Al Jawal ADFDI Oracle-Fusion template EXACTLY (same columns, same Distribution Combination, same segment breakdown). EDIT mode: only touch asateel-sample/asateel_poc.py (the POC). Do NOT modify pipelines/, scripts/, or any deployed/portal code. Re-run on the 15 sampled invoices using the EXISTING cached Gemini extractions (asateel-sample/_poc_out/_cache/*.json) — do NOT re-call vision. Report; do not deploy.

# PROBLEM
The current POC output (asateel-sample/_poc_out/asateel-poc-2026-06-20.xlsx) is a flat custom table.
It must instead look like the real Al Jawal output so it drops straight into the same Oracle upload flow.

# REFERENCE TEMPLATE (copy this structure exactly)
File: /home/clawdbot/.openclaw/workspace/aljeel/batches/jawal-J26-640/output/Spreadsheet-J26-640-FILLED-v30.xlsx
- Single sheet named "Sheet".
- Row 1: blank. Row 2: section banners ("ORACLE FUSION TEMPLATE" at A2, "CODE & DESCRIPTION" at Q2, "DEBUG (delete before upload)" at AG2).
- Row 3: HEADER ROW (the real column names). Data starts row 4.
- 59 columns (A..BG). You MUST reproduce columns A..AF identically; the DEBUG block AG..BG can be Asateel-specific (see below).
READ that file with openpyxl first to copy exact header strings, column order, and a couple of data rows so the format matches.

## Columns A..AF (MANDATORY, exact order + meaning)
A *Invoice Header Identifier (constant 1)
B *Business Unit  = "Al Jeel Medical BU"
C *Invoice Number = the Asateel invoice number (e.g. 03048)
D *Invoice Currency = SAR
E *Invoice Amount = INVOICE TOTAL INCLUDING VAT (the page-1 grand total)
F *Invoice Date (YYYY-MM-DD)
G **Supplier = the Asateel Arabic legal name "شركة اساطيل الطريق للنقل البري" (or as extracted)
H **Supplier Number = Asateel supplier number — we may not have it; leave blank or "" if unknown (do NOT invent). Put a note in DEBUG.
I *Supplier Site = supplier site (blank/"" if unknown)
J Invoice Type = Standard
K Description = short line description (truck type + route + dispatch#)
L *Type = Item
M *Amount = LINE AMOUNT **EXCLUSIVE of VAT** (the pre-VAT subtotal for THIS distribution line). NOTE the contrast: E=incl VAT (header), M=excl VAT (line). For multi-line splits, M is that line's own excl-VAT amount.
N Distribution Combination = the 10-segment string, hyphen-joined, EXACTLY like Jawal:
   Company-Location-Account-CostCenter-DIV-Solution-Agency-Project-Intercompany-Future
   Jawal examples: 03-40100-60301003-160013-192-00000-00000-00000-00-000000
                   03-20100-60307021-160011-196-00000-10043-00000-00-000000
   Inspect the reference file col N to confirm the EXACT number of segments and zero-padding widths, and reproduce them. Pad each segment to the same width Jawal uses (Company 2, Location 5, Account 8, CostCenter 6, DIV 3, Solution 5, Agency 5, Project 5, Intercompany 2, Future 6 — VERIFY against the file).
O Tax Classification = "KSA VAT STANDARD" (Asateel always 15% VAT, so STANDARD, never ZERO)
P Employee No = blank for Asateel (these are vendor transport invoices, not employee travel) unless a salesperson path applies — leave blank by default
Q Company = 03
R Location = the Location segment (use the same Jawal default Location convention; if unknown use 20100 — VERIFY what Jawal uses and note assumption)
S Account = 61500027  (Asateel freight/transport GL constant)
T GL = the Account Index description from Aljeel_Lookups-v2 Account sheet for 61500027 if present; else "Transportation/Freight Expense" with a DEBUG note that 61500027 is not in the Account sheet
U Cost Center = resolved cost center (blank if YELLOW/unresolved)
V Cost Name = cost center name (blank if unresolved)
W DIV = resolved division code (blank if unresolved)
X Contribution = the DIV description / contribution label (mirror how Jawal fills col X = division description; blank if unresolved)
Y Solution = 00000 (General) unless we have a solution mapping; default 00000
Z Solution Name = General (or mapped)
AA Agency = resolved Agency CODE (5-digit, e.g. 10111 for Bio-Rad; 00000 if unresolved)
AB Agency Name = resolved Agency canonical name (blank/General if unresolved)
AC Project = 00000
AD Intercompany = 00
AE Future 1 = 000000
AF GL Description = human summary like Jawal ("<Account desc> · <Cost Name> · <Agency Name>")

## DEBUG block AG..BG (Asateel-specific, keep useful trace)
Reuse Jawal's first DEBUG col header "Row Status" at AG (RED/YELLOW/GREEN), then Asateel-relevant debug columns:
 Row Status, Allocation Source (brand|salesperson|none), Extracted Brand(s), Extracted Salesperson,
 Agency Match Confidence, Manpower Cluster Found (Y/N), Split Method (per_line|even|n/a),
 Reference(المرجع), Dispatch Ref, Supply Order, VAT Amount, Notes.

# ALLOCATION / SPLIT RULES (unchanged from POC v1, keep them)
- Brand -> Agency(676 list) -> Manpower "New agency" -> DIV + Cost Center. Salesperson -> Manpower -> DIV+Agency+CC.
- No Manpower cluster or no match -> YELLOW, leave U/V/W/X/AA/AB EMPTY (Agency code 00000, names blank). Never guess.
- Multi-agency invoice -> one DISTRIBUTION ROW per agency (per Jawal: each distribution line is its own row sharing the same Invoice Number/Header). Split amount per line's own excl-VAT subtotal; if line amounts not extractable, even split. Set Split Method accordingly.
- IMPORTANT VAT MATH: page-1 amounts may be quoted incl or excl VAT — determine from the doc. Col M must be the EXCL-VAT line amount. If a line's amounts are only available incl VAT, divide by 1.15 to get excl, and note it. Header col E = total incl VAT for the whole invoice.

# RUN
- Use cached extractions in asateel-sample/_poc_out/_cache/*.json (do NOT re-call Gemini).
- Write new workbook: asateel-sample/_poc_out/asateel-poc-oracle-2026-06-20.xlsx (keep the old one).
- Keep the JSON trace updated/regenerated alongside.
- Apply RED/YELLOW/GREEN fills to the data rows (reuse scripts/excel_styling.py helpers if importable; else plain fills). Match Jawal: color the Row Status / whole row the same way.

# VALIDATE + REPORT
- Print, per output row: Invoice, line, M(excl-VAT), Distribution Combination (col N), Agency code/name, DIV, CC, Row Status.
- Confirm the header row strings A..AF match the reference file character-for-character (print any diffs).
- Re-score CENTRAL rows vs Entry-1/Entry-2.xlsm answer key as before (Agency/CC/DIV hit-rate), now that the combo is built.
- Short list of any assumptions made (Location default, Supplier Number unknown, Account 61500027 not in lookup, etc).

# CONSTRAINTS
- ONLY lookup = Aljeel_Lookups-v2.xlsx. Entry sheets = answer key only.
- Only edit asateel-sample/asateel_poc.py. New output file only. No deploy.
