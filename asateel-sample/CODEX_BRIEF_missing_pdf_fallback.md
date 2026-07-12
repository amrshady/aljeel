# Task: Emit master-fallback rows for invoices in Expenses-Format master but missing a PDF

Target engine: `/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py`
(Production wrapper `pipelines/asateel.py` delegates to it.)

## Problem
The Asateel engine is PDF-driven: it iterates over extracted PDFs and emits Oracle rows per
invoice. If an invoice number exists in the **Expenses Format master** sheet but its PDF was never
uploaded, that invoice is silently dropped from the output. Example: Central-15 master lists 37
invoices, only 35 PDFs staged, so invoices **03929** and **03931** never appear in the output sheet
(output shows 35 invoices instead of 37). Finance needs the sheet to reconcile to the master.

## Required behavior
After building rows from the PDFs, detect invoice numbers that are present in the Expenses Format
master (the supplier `supplier_index` / Expenses-Format loader keyed by invoice number) but have NO
corresponding processed PDF/output row, and EMIT master-fallback rows for them:

1. **Allocate them normally from the master + SO_Detail.** We have full data in the master row
   (employee number, JQ list, agency/solution, amount, date) plus the SO_Detail export for
   JQ->agency resolution. Reuse the existing allocation/split logic (per-JQ, multi-agency even split,
   Option-A CC/DIV inheritance, GL Description build, Additional Information native-JQ spelling, etc.)
   so CC/DIV/Agency/GL/Distribution Combination all populate exactly like a normal row. Multi-JQ
   invoices must still split into multiple rows.
2. **Force Row Status = RED** on every master-fallback row, regardless of allocation confidence.
3. **Add a clear note** on each such row, e.g.:
   `PDF MISSING — allocated from Expenses-Format master + SO_Detail only; invoice total NOT verified against scan`
   Add a matching exception category (e.g. `MISSING_PDF`) so it shows in the summary's exceptions.
4. **Header fields:** these rows carry the master's Invoice Amount + Invoice Date on the FIRST row of
   the invoice (same first-row-only rule already implemented), MM/DD/YYYY date format, and share the
   per-invoice Column-A serial like any other invoice. Line-level `*Amount` comes from the master
   allocation. Currency SAR, Business Unit / Supplier / Company / Location constants as normal.
5. Since there is no PDF, PDF-derived debug fields (extracted description/reference/dispatch_ref,
   header subtotal/total from scan, trace pdf) should be blank/empty; note the reason. Do NOT
   fabricate a scan total.

## Where the master row data lives
Inspect the Expenses-Format loader (supplier index, ~line 1415+, `load_supplier_expenses_format`
or similar) — it already parses invoice_no, employee_number, jq (multi), amount per supplier line.
Build the fallback rows from those supplier records for invoices not covered by a PDF extraction.
The master row for 03929 has: emp 1000699, JQs "JQ-26122347 JQ-26123668 JQ-26123829", amount 1725,
date 2026-06-17. 03931: emp 1000377, JQs "JQ-25077224 JQ-26123792", amount 632.5, date 2026-06-17.

## Constraints
- Do NOT regress the golden gate. Golden signature is **188 rows · GREEN 7 · YELLOW 181 · RED 0 ·
  6 blank CC · 92/92 reconciled**. IMPORTANT: the golden batch presumably has a PDF for every master
  invoice, so this new fallback must produce ZERO extra rows on the golden batch (no master invoice
  without a PDF there). After the change, `python3 qc/asateel_golden_check.py` (run from the aljeel
  workspace root) MUST still print `GOLDEN OK`. If it does not, the fallback is firing on golden —
  fix the detection so it only triggers for genuinely-missing PDFs.
- Keep all previously-shipped fixes intact (invoice serial, first-row-only amount/date, MM/DD/YYYY,
  native-JQ Additional Information from SO_Detail).
- Report the diff + golden-check result. Do NOT deploy or overwrite batch outputs.
- State any assumption you make (e.g. how you key "invoice has no PDF").
