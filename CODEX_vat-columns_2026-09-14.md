Implemented the code change only. No batch was rerun and nothing was deployed.

Changed files:

- [scripts/run_hybrid_v15_12.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_hybrid_v15_12.py:173)
- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:6227)
- [tests/test_v30_invoice_tax_output.py](/home/clawdbot/.openclaw/workspace/aljeel/tests/test_v30_invoice_tax_output.py:1)

Task-specific diff:

- Inserts `Inv. Amt. Incl. VAT` and `VAT Amt.` after `*Invoice Amount`.
- Copies surrounding header/cell styling and assigns appropriate widths.
- Loads `invoice-source.xlsx`, sheet `Sheet`, from row 28.
- Matches exact 10-digit tickets from source column 12 against `Description`.
- Writes source columns 47 and 42 respectively; unmatched rows remain blank.
- Rebuilds merged banners:
  - Oracle: `A:P` → `A:R`
  - Code & Description: `Q:AF` → `S:AH`
  - Debug: `AG:BO` → `AI:BQ`
- Modifies only the active Oracle sheet; `Refunds` and secondary sheets remain unchanged.
- `split_multi_emp.py` required no change because it copies complete rows and resolves operational columns by header name.

Hardcoded indices did require updates in the late v30 location-rewrite pass:

- Distribution Combination: column `14` → `16`
- Employee No: column `16` → `18`
- Distribution Combination write-back: column `14` → `16`

Associated column-number documentation was updated:

- GL `20` → `22`
- Cost Name `22` → `24`
- Contribution `24` → `26`
- Solution Name `26` → `28`
- Agency Name `28` → `30`
- GL Description `32` → `34`

Verification: six focused tests passed, Python compilation passed, and `git diff --check` passed.
