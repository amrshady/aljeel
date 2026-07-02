Implemented and ran the standalone POC only under `asateel-sample/`.

Files created/updated:
- [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py)
- [asateel-poc-2026-06-20.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-2026-06-20.xlsx)
- [asateel-poc-trace-2026-06-20.json](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/_poc_out/asateel-poc-trace-2026-06-20.json)

I did not modify `pipelines/asateel.py`, `jawal.py`, or portal/deployed code.

Run result:
- Processed all 15 sampled full PDFs via `pdftoppm` rendered images + Gemini vision.
- Used only `Aljeel_Lookups-v2.xlsx` for allocation.
- Generated one Excel distribution output plus JSON trace.
- Reused `scripts/excel_styling.py` row colors.

Validation against Entry sheets:
- Entry answer rows found only for CENTRAL invoices in the sampled set.
- Comparable distribution rows: `8`
- Agency hit rate: `2/8 = 25.0%`
- Cost Center hit rate: `2/8 = 25.0%`
- Division hit rate: `2/8 = 25.0%`
- All three segments: `2/8 = 25.0%`

Main misses:
- Several CENTRAL invoices had missing or ambiguous salesperson/brand evidence and were correctly left YELLOW with blank allocation.
- `03044` extracted salespeople but resolved to the wrong agency/CC vs Entry.
- PROJECTS/ADMIN invoices had no matching answer-key rows in `Entry-1.xlsm` / `Entry-2.xlsm`, so they could not be scored against Entry.

Hardening items:
- Add regression fixtures for handwritten brand/salesperson extraction.
- Add deterministic parsers after Gemini identifies page layout.
- Expand or formalize Manpower agency-cluster coverage so no-cluster agencies route cleanly to review.
