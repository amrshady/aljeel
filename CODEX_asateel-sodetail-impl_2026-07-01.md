Implemented and did not deploy.

**Diff Summary**
Touched:
- [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:42)
- [pipelines/asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:39)

Local diff size from pre-change snapshots:
- `asateel_poc.py`: 440 diff lines
- `pipelines/asateel.py`: 91 diff lines

Main changes:
- Added `--so-detail`, defaulting to `reference/SO_Detail_Labadi_1_R21_AA.xlsx`.
- Added `load_so_detail()` and canonical `JQ-NNNNNNNN` parsing.
- Made SO_Detail authoritative over supplier Expenses Format and Manpower.
- Dedupes SO_Detail by distinct `CAT_AGENCY` only, ignoring org-only differences.
- Splits multi-agency JQs evenly with cent remainder to the last agency.
- Added SO_Detail debug/public JSON fields and `so_detail_path` trace/summary wiring.
- Entry-1/Entry-2 validation path was not changed.

**Validation**
Passed:
- `python3 -m py_compile asateel-sample/asateel_poc.py pipelines/asateel.py`
- `python3 pipelines/asateel.py --folder CENTRAL --full`

SO_Detail loader counts now match approved figures:
- Loaded JQs: `9552`
- Duplicate JQs: `1192`
- Multi-agency: `827`
- Same-agency-different-org: `365`

**Before vs After CENTRAL**
Before:
- Invoices: `92`
- Rows: `188`
- GREEN/YELLOW/RED: `{'GREEN': 7, 'RED': 6, 'YELLOW': 175}`
- Split methods: `{'even': 6, 'n/a': 3, 'per_jq': 175, 'per_line': 4}`
- Exceptions: `{'ALLOCATION_REVIEW': 148, 'ALLOC_MISMATCH': 4, 'HOME_AGENCY_DISCREPANCY': 33}`
- Reconciled/mismatched: `88/4`

After:
- Invoices: `92`
- Rows: `204`
- GREEN/YELLOW/RED: `{'GREEN': 96, 'RED': 4, 'YELLOW': 104}`
- Split methods: `{'even': 6, 'n/a': 3, 'per_jq': 160, 'per_jq_agency_even': 31, 'per_line': 4}`
- Exceptions: `{'ALLOCATION_REVIEW': 72, 'ALLOC_MISMATCH': 4, 'HOME_AGENCY_DISCREPANCY': 10, 'SO_DETAIL_SUPPLIER_DISCREPANCY': 26}`
- Reconciled/mismatched: `88/4`
- Header validation: `A:AF match reference = True`, `0` diffs

**Verification Cases**
Multi-agency split:
- Invoice `03112`, `JQ-26108708`
- SO_Detail agencies: `10216/DETROX`, `10041/Fujifilm`, `10082/Atmos`
- Output rows:
  - `4.1`: `105.55`, agency `10216 DETROX`, `YELLOW`, `per_jq_agency_even`
  - `4.2`: `105.55`, agency `10041 Fujifilm`, `YELLOW`, `per_jq_agency_even`
  - `4.3`: `105.57`, agency `10082 Atmos`, `YELLOW`, `per_jq_agency_even`

Same-agency-different-org did not split:
- Invoice `03044`, `JQ-26109036`
- SO_Detail rows: `2`
- Distinct agencies: `1`
- Orgs: `JEEL_DSV_NORMAL`, `JEEL_DSV_NUPCO`
- Output: one `per_jq` row, amount `375.00`, agency `10202 Solventum`, status `GREEN`

Missing from SO_Detail fallback:
- Invoice `03042`, `JQ-25070626`
- Output: amount `550.00`, agency `10153 BMX`
- Source: `supplier_expenses_format`
- Status: `YELLOW`
- Note includes `JQ not in SO_Detail export`
