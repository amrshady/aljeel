# Task: Clean up the note on MISSING_PDF fallback rows

Target engine: `/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py`

Context: we recently added master-fallback rows for invoices present in the Expenses-Format master
but missing a PDF (commit 46413e8). They are forced RED with a `MISSING_PDF` category and a note
beginning `PDF MISSING — allocated from Expenses-Format master + SO_Detail only; invoice total NOT
verified against scan`.

Problem: because there is no PDF/scan, a legacy severity sub-note gets appended to these rows:
`RED: invoice number or total not extractable`. That is misleading noise on MISSING_PDF rows (the
number IS known from the master; there is simply no scan to foot against).

## Required change
On MISSING_PDF fallback rows ONLY:
- Suppress/omit the `RED: invoice number or total not extractable` sub-note (and any other
  scan-extraction-failure sub-note that only fires because there is no PDF, e.g. totals-do-not-foot).
- Keep the primary `PDF MISSING — allocated from ...` note and all genuine allocation sub-notes
  (SO_Detail authoritative, agency-vs-manpower discrepancy, JQ not in SO_Detail export, solution
  blank, location confirmed, etc.).
- Row Status stays RED, MISSING_PDF category unchanged.
Do NOT change note behavior on normal (PDF-backed) rows.

## Constraints
- Golden gate must still print `GOLDEN OK` (run `python3 qc/asateel_golden_check.py` from the aljeel
  workspace root). Golden has no MISSING_PDF rows, so signature must be unchanged.
- Keep all prior fixes intact (invoice serial, first-row-only amount/date, MM/DD/YYYY, native-JQ
  Additional Information, master-fallback allocation).
- Report the diff + golden result. Do NOT deploy or overwrite batch outputs.
