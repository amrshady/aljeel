Implemented and ran the batch. No deploy performed.

**Files Touched**
- [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:463)
- [asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:301)

**Diff Summary**
- Added `--pdf-dir` to both CLIs.
- Added direct `*_0001.pdf` enumeration from `--pdf-dir`, sorted by 5-digit invoice number, using `--folder` only as the output label.
- Added isolated override cache keys via `pdf_dir_cache_tag()`.
  - Default remains unchanged: `CENTRAL__03041.json`
  - Override uses: `CENTRAL__asateel-central-15__03928.json`
- Production wrapper now passes `--pdf-dir` through to the engine.

Diff sizes:
- `asateel_poc.py`: 93 diff lines
- `pipelines/asateel.py`: 26 diff lines

**Verification**
- `python3 -m py_compile asateel-sample/asateel_poc.py`: passed
- `python3 -m py_compile pipelines/asateel.py`: passed
- Golden CENTRAL PDFs unchanged: 92 before, 92 after, no diff
- Golden CENTRAL cache unchanged: 92 before, 92 after, no diff
- Batch-15 isolated cache created: 35 files named `CENTRAL__asateel-central-15__*.json`

**Live Run**
Command completed successfully:
```bash
python3 pipelines/asateel.py --folder CENTRAL --full --pdf-dir '/home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-central-15/src' --expenses-format '/home/clawdbot/.openclaw/workspace/aljeel/batches/asateel-central-15/src/Central 15-2026.xlsx' --so-detail '/home/clawdbot/.openclaw/workspace/aljeel/reference/SO_Detail_Labadi_1_R21_AA.xlsx'
```

Run summary:
- Invoices processed: 35
- Distribution rows: 106
- GREEN/YELLOW/RED: `{'GREEN': 32, 'RED': 12, 'YELLOW': 62}`
- Split methods: `{'n/a': 2, 'per_jq': 67, 'per_jq_agency_even': 37}`
- Reconciled/mismatched invoices: `27/8`
- Exceptions by category: `{'ALLOCATION_REVIEW': 27, 'ALLOC_MISMATCH': 8, 'HOME_AGENCY_DISCREPANCY': 1, 'SO_DETAIL_SUPPLIER_DISCREPANCY': 46}`
- Header A:AF validation: passed, `diffs: []`
- Allocation sources: `{'so_detail': 97, 'supplier_expenses_format': 9}`

Note on expected missing SO_Detail JQs: the run produced 9 supplier-format fallback rows, but only 7 rows/distinct JQs carry the explicit `JQ not in SO_Detail export` note. The other 2 supplier fallback rows have blank JQ values from extraction/matching.

**Concrete Rows**
- SO_Detail-resolved single-agency:
  - Invoice `03930`, line `1`, JQ `JQ-26121747`, amount `566.67`, `GREEN`, `per_jq`, agency `10153/BMX`, source `so_detail`.

- Multi-agency split:
  - Invoice `03934`, line `1.1`, JQ `JQ-26124676`, amount `225.0`, `YELLOW`, `per_jq_agency_even`, agency `10153/BMX`, source `so_detail`.

- Missing-from-SO_Detail fallback:
  - Invoice `03928`, line `1`, JQ `JQ-26122481`, amount `450.0`, `YELLOW`, `per_jq`, agency `10153/BMX`, source `supplier_expenses_format`, note includes `JQ not in SO_Detail export`.

Outputs written under `matched/`, including [asateel-summary.json](/home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-summary.json) and [asateel-trace.json](/home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-trace.json).

[status: done rc=0]
