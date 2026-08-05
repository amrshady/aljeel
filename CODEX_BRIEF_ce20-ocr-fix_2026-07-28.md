# Codex Brief — Fix OCR allocation extraction for scanned OPEX PDFs (CE-20-2026 class)

IMPLEMENT (not read-only). File: scripts/run_v30.py. MINIMAL, surgical edits only. No refactor of unrelated code.
After editing: show a unified diff and run `python3 -c "import ast; ast.parse(open('/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py').read())"`.
Do NOT run the full pipeline. Do NOT deploy/upload. Do NOT touch other files unless strictly required (explain if so).

## Problem (already diagnosed empirically)
Batch J26-1080, ticket CE-20-2026 (Getinge). Its `OPEX-CE-20-2026-J-2026-120.pdf` is a CamScanner scan (1 page, single JPEG, NO text layer). The digital-text parser correctly returns 0 allocations, so the sponsoring-form index does not include it → the row is never promoted to 60307021. The CRM-2026-39 form (digital text) works fine and returns 3 allocations.

An OCR fallback already exists in the file: `_ocr_pdf_first_page` (line ~1099), `_extract_ocr_sponsorship_allocations` (line ~1776), `_ocr_employee_for_allocation_line` (line ~1723). It is NOT reaching a good result for CE-20 for TWO reasons:

### BUG 1 — manpower not passed at the index-builder call site
`_extract_sponsorship_allocations_from_opex_pdf(pdf_path, manpower=None)` (line 1847) only runs its OCR fallback when `manpower` is truthy (see the `if ocr_text and manpower:` guard). But the new sponsoring-form index builder calls it WITHOUT manpower:
- line ~1920: `_salesmen, allocations = _extract_sponsorship_allocations_from_opex_pdf(pdf_path)`  ← no manpower
- The builder function `_build_sponsoring_form_folder_index(raw_root)` (line ~1908) has no `manpower` param at all.
- Its caller in `main()` is around line ~4986: `sponsoring_form_folders = _build_sponsoring_form_folder_index(raw_root)`. `manpower` is already loaded at line ~4918 (`manpower = fea.load_manpower()`), so it is in scope there.

FIX 1: Thread manpower through.
- Change `_build_sponsoring_form_folder_index(raw_root: Path)` to `_build_sponsoring_form_folder_index(raw_root: Path, manpower: dict | None = None)`.
- Inside it, pass manpower into the parser: line ~1920 becomes `_extract_sponsorship_allocations_from_opex_pdf(pdf_path, manpower)`.
- Update the call site in main() (~4986) to `_build_sponsoring_form_folder_index(raw_root, manpower)`.
- (Line ~1994 already has a manpower-passing variant at ~1998; leave that logic as-is.)

### BUG 2 — the OCR render config garbles this scan
`_ocr_pdf_first_page` currently renders with `pdftoppm -r 600 -gray` and runs `tesseract ... --psm 6`. Empirical testing on OPEX-CE-20-2026 shows this MANGLES the allocation table rows. The following configs read the table PERFECTLY (verified: `1002075 Azzam Alotaibi 30,000` and `1001986 Mohammed Gaseem 10,000` both come out clean):
- 300 dpi, default color, tesseract default psm (psm 3)
- 400 dpi, tesseract --psm 4

FIX 2: Make `_ocr_pdf_first_page` more robust. Minimal approach:
- Render at 300 dpi (not 600) and DROP the `-gray` flag (render color / default). Keep pdftoppm as primary, PyMuPDF fallback.
- Run tesseract WITHOUT forcing `--psm 6` (use default psm 3) OR use `--psm 4`. Prefer default psm 3 since it tested clean at 300 dpi.
- Optional but recommended (only if easy & low-risk): try psm 3 first, and if the returned text does NOT contain `event allocation details` / `amount to allocate`, retry once at 400 dpi `--psm 4`. Keep it simple; do not add heavy dependencies. tesseract, pdftoppm, and PyMuPDF (fitz) are all already available.

Do NOT change `_extract_ocr_sponsorship_allocations` or `_ocr_employee_for_allocation_line` — they work correctly once given clean OCR text (verified: with clean 300dpi text they resolve both employees). The only OCR issue is the render/psm settings in `_ocr_pdf_first_page`.

## Constraints
- Minimal diff. Do not change digital-text parsing path (it must keep working for CRM-2026-39 and other text PDFs).
- Do not change account codes, columns, output schema, or the overlay/split logic.
- Keep behavior identical for PDFs that already parse via text layer (OCR is fallback-only when text parse yields 0 allocations).
- The parser must still REFUSE to invent amounts: if OCR amounts are incomplete or don't sum to the stated Total, existing code blanks amounts for even-ratio split — keep that.

## Deliver
1. Unified diff (file:line) of the changes.
2. Confirm `ast.parse OK`.
3. One paragraph: how OPEX-CE-20-2026-J-2026-120.pdf will now yield 2 allocations (1002075 Azzam Alotaibi 30,000; 1001986 Mohammed Gaseem 10,000) and thus enter the sponsoring-form index.
4. Any risk to text-layer PDFs or performance (OCR only runs on the fallback path).
Do NOT run the pipeline or deploy.
