# Change Log — QC Enrichment (2026-05-21)

## New Files
| File | Purpose |
|------|---------|
| `scripts/excel_styling.py` | Row-level color coding (GREEN/YELLOW/RED) classification |
| `scripts/qc_catches_within_batch.py` | Within-batch QC catches (ported from pipelines/jawal.py) |
| `scripts/cross_batch_fraud.py` | Cross-batch fraud detection (NEW) |

## Modified Files
| File | Changes |
|------|---------|
| `scripts/process_batch.py` | Added imports for 3 new modules; stores `_description`, `_amount`, `_ticket_no` on ResolvedLine; extracts `inv_date`; runs within-batch + cross-batch QC after Stage 5; applies row-status-based coloring; adds `Row Status` + `QC Catches` columns; updates summary JSON with `row_status_breakdown`, `within_batch_catches`, `cross_batch_catches`, `catches_by_category` |
| `qc/qc_gates.py` | Fixed premature `return result` at line 225 that made S20-S25 (trip purpose gates) dead code. Return moved to end of function. |
| `PROCESS/run_jawal_batch.sh` | Added row status + QC catches reporting in Stage 7 post-run verification |

## Backup Files Created
- `scripts/process_batch.py.bak-pre-qc-*`
- `PROCESS/run_jawal_batch.sh.bak-pre-qc-*`
- `qc/qc_gates.py.bak-pre-qc-*`

## New Output Files (per batch)
- `output/catches-within-batch.json` — within-batch QC catches
- `output/catches-cross-batch.json` — cross-batch fraud catches
- `cache/cross_batch_history.json` — persistent cross-batch state (accumulates across runs)
