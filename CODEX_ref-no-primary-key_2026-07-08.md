Implemented the Ref. No. evidence-resolution path locally. No deploy, no wrangler, and I did not run a full v30 write/rerun.

**Root Cause**
`Ref. No.` did survive only inside converter memory as `ref_no`, and numeric Ref. No. values were mapped into `Employee No`, but event refs like `CRM-2026-31` were not preserved in the pipeline workbook. `run_v30` then gated evidence with `_row_reference_token()` from the trailing `Description` parenthetical, which is the Jawal `Ticket No.` value. For `26-XXX` rows, that key appears nowhere in evidence, so `stamp_missing_evidence_gate()` blanked allocation before Call 1/Call 2 could read the real event folder.

**Diff**
Changed three files:

- [scripts/convert_jawal_invoice.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/convert_jawal_invoice.py:39)
  Added `Invoice Ref No` to output headers and writes raw invoice col 7 `ref_no` into each converted row.

- [scripts/process_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/process_batch.py:915)
  Reads `Invoice Ref No` from input, stores it on each resolved row, and carries it into the v15.11.2 debug block as `Invoice Ref No`.

- [scripts/run_v30.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/run_v30.py:1971)
  Added invoice-ref folder indexing and resolution:
  `REF_FOLDER`, `REF_EMP_FILENAME`, and `REF_FUZZY`.
  Existing ticket evidence keeps priority. Ref. No. is only used when the ticket key does not resolve.
  Existing cascade artifacts can backfill Ref. No. from `/mnt/aljeel_ap_kb/current/<batch>/invoice.xlsx` by row order.
  Fuzzy SIS sibling matches resolve to the sibling folder and stamp `REF_FUZZY` plus QC text.

Note: `git diff` also shows a pre-existing dirty hunk in `run_v30.py` around `fea.iter_evidence_files`; I did not introduce that change.

**Verification**
- `python3 -m py_compile scripts/convert_jawal_invoice.py scripts/process_batch.py scripts/run_v30.py` passed.
- J26-1029 dry gate, using current `v15.11.2` cascade plus raw invoice backfill:
  - existing v30 artifact currently shows `OK=55`, `MISSING=74` in this workspace
  - ticket-resolved first: `86`
  - Ref. No.-resolved after ticket miss: `43`
  - breakdown: `REF_FOLDER=24`, `REF_FUZZY=9`, `REF_EMP_FILENAME=10`
  - final dry hard-gate misses: `0`
  - all 9 SIS typo rows resolved to `SIS-14-2026` with soft note like `invoice Ref year mismatch (SIS-14-2027 vs folder SIS-14-2026)`

- J26-640 golden guard:
  - `score-v30.md` unchanged and still reports `108/117 = 92.3%`
  - travel subset still `6/6 = 100.0%`
  - dry gate unchanged by new logic: old missing `47`, new missing `47`, Ref. No. hits `0`

I also ran `qc/jawal_golden_check.py`; it targets J26-788, not J26-640, and currently fails due committed artifact drift unrelated to these edits.
