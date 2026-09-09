#!/usr/bin/env bash
set -uo pipefail
ROOT=/home/clawdbot/.openclaw/workspace/aljeel
SCRIPTS=$ROOT/scripts
set -a; [ -f /home/clawdbot/.openclaw/.env ] && . /home/clawdbot/.openclaw/.env; set +a
echo "=== STAGE 2: run_v30 (layer on v15.11.2) — J26-1108 ==="
python3 -u "$SCRIPTS/run_v30.py" J26-1108 --input-suffix v15.11.2
RC=$?
echo "=== run_v30 exit=$RC ==="
echo "=== golden gate (expected to TRIP by design) ==="
python3 "$ROOT/qc/jawal_j26_1108_golden_check.py"
echo "=== golden gate exit=$? ==="
echo "=== DONE ==="
