# Wrapper Changes

## `PROCESS/run_jawal_batch.sh`

No new stages added — QC catches are integrated directly into `scripts/process_batch.py` (single Excel write pass, more efficient than re-opening the file).

### Stage 7 (Post-run verification) additions:
- Reports row status breakdown (GREEN/YELLOW/RED counts) from summary JSON
- Reports within-batch and cross-batch catch counts from summary JSON
- New summary fields read: `row_status_breakdown`, `within_batch_catches`, `cross_batch_catches`

## `PROCESS/PROCESS.md`

Should be updated to document:
- Within-batch QC catches (DUP_ROUTE_STRICT, NO_APPROVAL, EMD_MISMATCH, OVER_LIMIT, ROUND_AMOUNT)
- Cross-batch fraud detection (CROSS_BATCH_DUPLICATE_TICKET, POTENTIAL_REBOOKING_FRAUD, FREQUENT_TRAVELER_OVER_BUDGET, PASSENGER_AMOUNT_PATTERN)
- Row-level color coding (GREEN/YELLOW/RED) with flag classification rules
- New output files: catches-within-batch.json, catches-cross-batch.json
- Persistent state: cache/cross_batch_history.json
- New Excel columns: Row Status, QC Catches
- Bug fix: qc_gates.py S20-S25 trip purpose gates were dead code (premature return)

## Data Flow

```
process_batch.py Stage 1-4: resolve all lines
  ↓
process_batch.py Stage 5: write Excel (Distribution Combination + agent columns)
  ↓
NEW: Run within-batch QC catches → catches-within-batch.json
  ↓
NEW: Run cross-batch fraud checks → catches-cross-batch.json
  ↓
NEW: Update cross-batch history → cache/cross_batch_history.json
  ↓
NEW: Classify each row → GREEN/YELLOW/RED
  ↓
NEW: Apply row-level coloring + write Row Status + QC Catches columns
  ↓
process_batch.py: Write summary (now includes row_status_breakdown + catch counts)
  ↓
Stage 6: Golden regression (unchanged — still checks combo correctness)
  ↓
Stage 7: Post-run verification (now also reports row status + catches)
```
