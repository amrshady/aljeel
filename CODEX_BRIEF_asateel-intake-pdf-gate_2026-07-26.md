# Codex Brief — Asateel intake gate: reject Expenses-Format submissions missing a PDF (Option A)

## The bug (root cause, established from real data)
Batch `asateel-وسطي 17-2026`, invoice `03786`: three RED rows in the Oracle upload
(`Folder=MASTER_FALLBACK`, "PDF MISSING — invoice total NOT verified against scan").
It reached allocation because the INTAKE validator could not see the invoice number.

Why: in the supplier "Expenses Format" master, invoice numbers are NOT in an
"Invoice No" column. They are embedded in free-text DESCRIPTION cells as
`"Transportation / NNNNN"` (verified: 1,320 occurrences across 14 master sheets,
prefix always "Transportation", NNNNN = 4–5 digits). The intake validator
(`packages/shared-types/src/asateel-invoice-manifest.ts` →
`extractInvoiceNumbersFromGrid`) only extracts numbers from a column whose HEADER
matches /invoice\s*(no|number)/i. This sheet has no such header, so it extracts
ZERO invoice numbers → the existing `ASATEEL_INVOICE_FILES_MISSING` gate never runs.

Meanwhile the allocation pipeline DOES parse these cells (via
`_supplier_description_invoice()` in `../aljeel/asateel-sample/asateel_poc.py`,
regex `(?:^|/)\s*(\d{4,5})\s*$`, plus header invoice fill-down `current_inv`), which
is why it knew 03786 existed and flagged it red. The two components disagree on where
the invoice number lives. Fix the intake extractor so the gate you ALREADY have fires.

## Goal (Option A — Ahmed approved)
A supplier must not be able to submit an Expenses-Format master row whose invoice
number has no matching PDF in the same submission. Reject at INTAKE (hard error,
bounced back), before allocation — nothing missing a scan enters the Oracle upload.

## Change
Primary: extend invoice-number extraction so it also reads the Expenses-Format
"Transportation / NNNNN" description cells, matching the PIPELINE's logic exactly:
1. In `packages/shared-types/src/asateel-invoice-manifest.ts`, add extraction of
   invoice numbers embedded in description/comments cells of an "Expenses Format"
   sheet, in ADDITION to the existing Invoice-No-column path. Rules (mirror the
   Python so the two never drift):
   - An invoice token is a 4–5 digit number appearing after a `/` (e.g.
     "Transportation / 03786" -> 03786; "Transportation / 04215" -> 04215).
     Use regex equivalent to the pipeline's `(?:^|/)\s*(\d{4,5})\s*$` per cell, and
     also handle a single row carrying TWO such cells in adjacent columns (row 26
     has both 03786 AND 04215 — BOTH must be extracted).
   - Also honor the header "Invoice Number" column fill-down (`current_inv`) the way
     `load_expenses_format` does: if a row has no description invoice, inherit the
     last seen header invoice. Do NOT let it bleed past the next header invoice.
   - Normalize to the pipeline's 5-width zero-padded form (`_code(x,5)`), so matching
     against filenames is consistent with `invoiceNoVariants`.
2. Keep the existing Invoice-No-column extractor for other Asateel sheet formats
   (Daily Shipping Report etc). This is additive — union the two result sets.
3. The existing `validateAsateelInvoiceManifest` + `fileMatchesInvoiceNo` logic then
   works unchanged: any extracted invoice number without a matching attachment ->
   `ASATEEL_INVOICE_FILES_MISSING` error (hard block). Confirm the manifest service
   (`apps/api/src/invoices/asateel-invoice-manifest.service.ts`) surfaces it as a
   rejection on the supplier submission path.

## Anti-drift (important)
The intake extractor and the pipeline `_supplier_description_invoice`/`current_inv`
logic MUST agree. Two acceptable approaches — pick and state which:
 (a) Port the exact regex + fill-down into TS with a shared unit test proving parity
     on the real cells: "Transportation / 03786", "Transportation / 04215",
     header-fill-down rows, and multi-invoice rows; OR
 (b) Have the API shell out to a small Python entrypoint that reuses the pipeline's
     own function (like the pt-mappings resolver pattern) so there is one source of
     truth. Prefer (b) if feasible in the intake path; else (a) with the parity test.

## Tests / proof (required)
- Unit test: given the real `Central_17-2026.xlsx` Expenses-Format shape (or a fixture
  mirroring row 26), extraction returns both 03786 and 04215 (+ the 042xx set).
- Manifest test: invoice 03786 present in sheet but no 03786 PDF among attachments ->
  `ASATEEL_INVOICE_FILES_MISSING` with 03786 in details.missingInvoiceNos. With the
  03786 PDF added -> no error.
- Existing manifest tests still pass. Run web+api typecheck and the shared-types test
  suite.

## Scope guard / do-not
- Asateel intake only. Do not touch Jawal/JJ intake or the allocation pipeline logic.
- Do NOT modify `asateel_poc.py` allocation behavior (only reuse its parse fn if
  approach (b)). Do not touch the on-hold SO_Detail agency change.
- DO NOT deploy. Report the diff + test output.
```
