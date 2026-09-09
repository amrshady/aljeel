#!/usr/bin/env bash
set -euo pipefail
ROOT=/home/clawdbot/.openclaw/workspace/aljeel
SCRIPTS=$ROOT/scripts
B=$ROOT/batches/jawal-J26-1140
set -a; [ -f /home/clawdbot/.openclaw/.env ] && . /home/clawdbot/.openclaw/.env; set +a
echo "=== STAGE 0: convert (tax code) ==="
python3 -u "$SCRIPTS/convert_jawal_invoice.py" --invoice-file "$B/invoice-source.xlsx" --batch-dir "$B" --master-data "$ROOT/qc/master-data/Aljeel_Lookups-v2.xlsx"
echo "=== STAGE 1: process_batch cascade ==="
python3 -u "$SCRIPTS/process_batch.py" --batch "$B" --raw-dir "$B/raw" --suffix v15.11.2
echo "=== STAGE 2: run_v30 ==="
python3 -u "$SCRIPTS/run_v30.py" J26-1140 --input-suffix v15.11.2
echo "=== DONE ==="
ls -la "$B/output/"*v30*.xlsx
