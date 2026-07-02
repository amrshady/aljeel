Implemented and verified. No deploy, no cache deletion.

**Files Touched**
- [asateel_poc.py](/home/clawdbot/.openclaw/workspace/aljeel/asateel-sample/asateel_poc.py:32)
- [asateel.py](/home/clawdbot/.openclaw/workspace/aljeel/pipelines/asateel.py:243)
- [asateel_golden_check.py](/home/clawdbot/.openclaw/workspace/aljeel/qc/asateel_golden_check.py:1)
- [asateel_golden_expected.json](/home/clawdbot/.openclaw/workspace/aljeel/qc/asateel_golden_expected.json:1)
- [asateel_stage_batch.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/asateel_stage_batch.py:1)

**Captured Golden Expected**
```json
{
  "allocation_lines": 188,
  "row_status_counts": {"GREEN": 7, "YELLOW": 181, "RED": 0},
  "blank_cost_center_rows": 6,
  "blank_cost_center_invoices": ["03045", "03110", "03149", "03309"],
  "blank_cost_center_row_keys": [
    {"invoice_no": "03045", "line_no": 2, "row_status": "YELLOW"},
    {"invoice_no": "03110", "line_no": 1, "row_status": "YELLOW"},
    {"invoice_no": "03149", "line_no": 2, "row_status": "YELLOW"},
    {"invoice_no": "03149", "line_no": 4, "row_status": "YELLOW"},
    {"invoice_no": "03149", "line_no": 6, "row_status": "YELLOW"},
    {"invoice_no": "03309", "line_no": 2, "row_status": "YELLOW"}
  ],
  "invoice_count": 92,
  "reconciled_invoices": 92,
  "mismatched_invoices": 0
}
```
The file also includes the `_comment` header and exact golden command array.

**Verification**
- `python3 -m py_compile asateel-sample/asateel_poc.py pipelines/asateel.py scripts/asateel_stage_batch.py qc/asateel_golden_check.py`: passed
- `python3 pipelines/asateel.py --folder CENTRAL --full`: passed, still `188` rows, `GREEN=7`, `YELLOW=181`, `RED=0`, blank CC `6`, reconciled `92/0`
- `python3 qc/asateel_golden_check.py`: printed `GOLDEN OK`, exit `0`

**Summary Provenance Sample**
```json
{
  "input_fingerprints": {
    "expenses_format_xlsx": {"name": "Central-11-2026.xlsx", "sha256": "2438f10f27296b5900b6476f9787e9b535f1e470816183d21935a10e860cd6fd", "size": 104032},
    "so_detail_xlsx": null,
    "lookups_master_xlsx": {"name": "Aljeel_Lookups-v2.xlsx", "sha256": "44b76030c1f3e170f3051ca3c0bcf26428b7cbfecaf2cc4ef7d839dc3d0c98d7", "size": 112692},
    "pdf_manifest": {"count": 92, "sha256": "479e792483a85e9dfcd7d17c1cf5a1c19256bbe2a02b08a590a33d02e29c917f"}
  },
  "provenance": {
    "pipeline_version": "2026-07-01.1",
    "git_sha": "nogit",
    "python_version": "3.12.3",
    "cli_args": {"folder": "CENTRAL", "full": true, "pdf_dir": "", "so_detail": ""},
    "input_fingerprints_key": "input_fingerprints"
  }
}
```
`so_detail_xlsx` is `null` for the golden because the required command passes no `--so-detail`; it fingerprints SO_Detail when that argument is supplied.

**Stage Helper Demo**
`python3 scripts/asateel_stage_batch.py --archive-date 2026-07-01 --folder-name 'وسطي 13' --batch-id central-13-verify`

Output confirmed:
- Resolved source: `/mnt/aljeel_ap_kb/archive/2026-07-01/asateel/وسطي 13`
- PDF count: `63`
- Expenses-Format master: `Central 13-2026.xlsx`

Removed the throwaway `batches/asateel-central-13-verify` after the demo.

**Cache Notes**
No silent cache expiry path found. Warm cache is used whenever the expected cache file exists and `--refresh-cache` is not passed. Explicit bypass risks remain: `--refresh-cache`, missing cache files, or changing `--pdf-dir` so the cache tag changes. The cache read site now documents that the per-batch cache is the authoritative extraction record.
