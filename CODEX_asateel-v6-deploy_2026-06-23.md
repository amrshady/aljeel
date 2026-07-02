Implemented locally only. No remote push, wrangler, or dashboard deploy.

**Approach**
I replaced the old v2 demo analyzer in [pipelines/asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py) with a production wrapper around the verified v6 engine in `asateel-sample/asateel_poc.py`. I chose delegation because the old production path used a different legacy allocation workbook model, while v6 already has the correct supplier Expenses Format parsing, per-JQ expansion, supplier-agency override logic, Oracle workbook writer, and cached extraction flow.

**Diff Summary**
`pipelines/asateel.py` now:
- loads the v6 POC engine via `importlib`
- runs full CENTRAL using cached Gemini extractions where available
- writes the Oracle upload workbook
- preserves:
  - `matched/asateel-allocation.json`
  - `matched/asateel-catch.json`
  - `matched/asateel-summary.json`
- adds audit trace:
  - `matched/asateel-trace.json`

Files touched:
- [pipelines/asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py)

Generated outputs:
- [asateel-oracle-upload.xlsx](/home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-oracle-upload.xlsx)
- [asateel-allocation.json](/home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-allocation.json)
- [asateel-catch.json](/home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-catch.json)
- [asateel-summary.json](/home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-summary.json)
- [asateel-trace.json](/home/clawdbot/.openclaw/workspace/aljeel/matched/asateel-trace.json)
- [asateel-pdf-headers.json](/home/clawdbot/.openclaw/workspace/aljeel/extracted/asateel-pdf-headers.json)

**Run Output**
Command run:

```bash
python3 pipelines/asateel.py --folder CENTRAL --full
```

Summary output:

```text
Invoices processed: 92
Distribution rows written: 188
GREEN/YELLOW/RED rows: {'GREEN': 7, 'RED': 6, 'YELLOW': 175}
Split methods: {'even': 6, 'n/a': 3, 'per_jq': 175, 'per_line': 4}
Reconciled/mismatched invoices: 88/4
Exceptions by category: {'ALLOCATION_REVIEW': 148, 'ALLOC_MISMATCH': 4, 'HOME_AGENCY_DISCREPANCY': 33}
```

Validation:
- `python3 -m py_compile pipelines/asateel.py` passed.
- `python3 qc/qc_gate.py --vendor asateel --no-golden` passed, with one expected warning because old QC does not know the new v6 categories `ALLOCATION_REVIEW` and `HOME_AGENCY_DISCREPANCY`.

**Required Checks**
- `03072`: 2 rows, both `split_method=per_jq`, amounts `275.00`, `275.00`.
- `03097`: 4 rows, `split_method=per_jq`, amounts `316.67`, `316.67`, `158.33`, `158.34`; cent remainder is on the last JQ row.
- `03317`, Ghadeer Alfaleh / employee `1001687`: supplier agency `10041/Fujifilm`, Manpower home agency `10043/Erbe`, `Home Agency Discrepancy=Y`, row status `YELLOW`, workbook fill `00FFEB9C`.

[status: done rc=0]
