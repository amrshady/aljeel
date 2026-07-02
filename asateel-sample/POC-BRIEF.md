TASK: Build a POC Asateel allocation engine and run it on 15 sampled invoices. EDIT mode (create new POC files only; do NOT modify pipelines/asateel.py, jawal.py, or any deployed/portal code). Report results; do not deploy.

# GOAL
Asateel transport invoices are an ALLOCATION problem (like Al Jawal), NOT reconciliation.
GL is constant = 61500027 (freight/transport). What varies per invoice = Agency + Cost Center + Division.
Build a self-contained POC script that, for each sampled invoice PDF, extracts data + resolves allocation
using ONLY Aljeel_Lookups-v2.xlsx, classifies RED/YELLOW/GREEN like Jawal, supports multi-agency splitting,
and writes one POC Excel + a JSON trace. Then validate against the Entry sheets (answer key) and report hit-rate.

# HARD CONSTRAINTS
- ONLY lookup allowed: /home/clawdbot/.openclaw/workspace/aljeel/qc/master-data/Aljeel_Lookups-v2.xlsx
  Sheets: Account, Agency(676 rows, code->name), Solution, DIV, Manpower(662 rows).
  Manpower cols (0-idx): 0 Emp No, 2 Name, 3 Arabic Name, 9 New Division, 11 New agency, 12 New cost center, 13 cc name, 15 Solution.
- DO NOT use Central-11-2026.xlsx, Wasati-11-2026.xlsx, or Entry-1/Entry-2.xlsm as INPUTS to allocation.
  Entry-1.xlsm / Entry-2.xlsm are ANSWER-KEY ONLY (use them at the very end to score the POC, not to drive it).
- Input is the FULL multi-page PDF, never a single page.

# INPUT FILES (15 sampled PDFs)
Base: /home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_pdfs/
- PROJECTS folder "مشاريع 13-2026": 03048 03049 03050 03051 03052  (files named <inv>_0001.pdf)
- ADMIN folder "اداره 8-2026": 03063 03064 03065 03066 03088
- CENTRAL folder "وسطي 11-2026": 03041 03042 03043 03044 03045

# OCR / EXTRACTION (critical)
- tesseract returns the printed page-1 (ZATCA tax invoice) BLANK due to a QR/vector render quirk. DO NOT rely on tesseract for page 1.
- Use a VISION/LLM call (Gemini) on the FULL PDF rendered to images. Use GEMINI_API_KEY env var (NOT GOOGLE_API_KEY).
  Model: gemini-3.1-pro-preview (vision). There is an existing pattern in aljeel/scripts/full_evidence_agent.py and ai_fraud_detector.py for Gemini calls — mirror their client/init style (read GEMINI_API_KEY, fallback GOOGLE_API_KEY).
- Render each PDF page with pdftoppm -r 150 -png (poppler is installed). Send all page images of one invoice in one vision call.
- Extract per invoice: invoice_number, invoice_date, vendor VAT, buyer VAT, and per LINE: description(truck type),
  reference(المرجع), dispatch_ref(كشف التخريج), supply_order(أمر التوريد), unit_price, qty, line_subtotal; plus invoice subtotal/VAT/total.
- ALSO extract the two allocation signals (search the WHOLE pdf, both may appear):
  (1) BRAND / principal on the Al Jeel handwritten goods-receipt note (PROJECTS + ADMIN). e.g. 03049 -> "Biorad".
  (2) SALES PERSON name on any embedded Al Jeel sales/tax invoice (CENTRAL). e.g. -> "Mohamed Elgamal".

# ALLOCATION RESOLUTION
- Load ALL 676 Agency rows (code+name) and pass them to the LLM so it matches the extracted brand to the REAL agency list
  (return the matched Agency code + canonical name + a confidence). No free-association — must be one of the 676 or "no match".
- Resolve to DIV + Cost Center via Manpower "New agency" column:
    brand -> Agency canonical name -> find Manpower rows where New agency == that name -> take New Division + New cost center.
    Salesperson path: name -> fuzzy match Manpower Name -> that row's New Division + New agency + New cost center.
- COVERAGE RULE: Manpower "New agency" has only ~31 distinct clusters vs 676 agencies. If the matched agency has NO Manpower
  cluster, OR brand/salesperson cannot be matched at all -> classify YELLOW and LEAVE Division/CostCenter/Agency-code EMPTY. NEVER guess.

# CLASSIFICATION (Jawal-style)
- GREEN: clean deterministic resolve (brand or salesperson matched to an Agency that has a Manpower cluster -> DIV+CC filled, high confidence).
- YELLOW: LLM/fuzzy match, low confidence (<0.9), agency matched but no Manpower cluster, or unmatched -> empty allocation for review.
- RED: hard data problem (no invoice number/total extractable, totals don't foot: subtotal+VAT != total within 1 SAR, etc).

# SPLITTING
- If one invoice resolves to MULTIPLE agencies (multi-line invoices like CENTRAL 03041/03044/03045 carry 2 lines/2 references),
  split into one output distribution row per agency. Allocate amount PER LINE using each line's own page-1 subtotal.
  If line-level subtotals are not cleanly extractable, fall back to EVEN split across the identified agencies. Mark which split method was used.

# OUTPUT
- Write to /home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/ :
  1. asateel-poc-<date>.xlsx — one row per output distribution line with columns:
     folder, invoice_no, invoice_date, line_no, description, reference, dispatch_ref, supply_order,
     line_amount, vat, total, GL(=61500027), Agency_code, Agency_name, Division, Cost_Center, Cost_Center_name,
     allocation_source(brand|salesperson|none), split_method(per_line|even|n/a), confidence, Row_Status(RED/YELLOW/GREEN), notes.
  2. asateel-poc-trace-<date>.json — raw extraction + resolution trace per invoice.
- Use the Accord brand styling pattern if aljeel/scripts/excel_styling.py exposes reusable helpers (import, don't duplicate); else plain fills RED/YELLOW/GREEN.

# VALIDATION (answer key, last step only)
- Open Entry-1.xlsm + Entry-2.xlsm (sheet "Invoices"; data is in a 147-col ADFDI "Create Invoices" sheet; the 10-segment
  Distribution Combination encodes Account-CostCenter-Division-...-Agency). Parse out, per invoice/supply-order if findable,
  the expected Account / Cost Center / Division / Agency. Match to our POC output by invoice amount + supply_order where possible.
- Print a hit-rate table: for the 15 invoices, how many of our Agency/CC/Division match the Entry-sheet answer key.
- Be explicit and honest about misses and why (handwriting unreadable, brand not in Manpower cluster, ambiguous, etc).

# DELIVERABLE
- Print a concise final summary to stdout: per-invoice (folder, inv, extracted brand/salesperson, resolved Agency/DIV/CC, status),
  the validation hit-rate vs Entry sheets, and a short list of what to fix to harden into the real pipeline.
- READ the existing pipelines/asateel.py and scripts/build_asateel_data.py FIRST to reuse helpers/conventions, but keep all POC code in NEW files under asateel-sample/ (e.g. asateel_poc.py). Do NOT edit existing pipeline/portal files.
