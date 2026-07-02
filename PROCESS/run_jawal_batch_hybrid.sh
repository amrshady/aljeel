#!/usr/bin/env bash
# AlJeel AP - Jawal Batch Processor v15.12 HYBRID (cascade + LLM agent)
#
# Usage:  bash PROCESS/run_jawal_batch_hybrid.sh <BATCH_ID> [<INVOICE_ID>]
# Examples:
#   bash PROCESS/run_jawal_batch_hybrid.sh J26-640
#   bash PROCESS/run_jawal_batch_hybrid.sh J26-593-BLIND J26-593
#
# Pipeline:
#   1. Runs v15.11.2 deterministic cascade (full v10 process)
#   2. Then runs LLM agent (Gemini 3 Pro -> 2.5 Pro -> 2.5 Flash cascade)
#      on rows where the cascade was uncertain.
#   3. Applies overlay rules (cascade wins where deterministic logic is stronger).
#   4. Family-cluster emp_no unification.
#
# Performance (locked May 25, 2026):
#   J26-640 regression:  100.0% all-5-exact (no regression vs cascade)
#   J26-593 hybrid:      ~73% all-5-exact (vs 62.5% cascade alone)
#   Cost per batch:      $0.40 - $1.50 (Gemini 3 Pro pricing)
#
# Hard rule: GEMINI_API_KEY direct, no LiteLLM proxy.

set -euo pipefail

ALJEEL_HOME="/home/clawdbot/.openclaw/workspace/aljeel"
PIPELINE_VERSION="v15.12-hybrid"
ENV_FILE="/home/clawdbot/.openclaw/.env"

if [ $# -lt 1 ]; then
  echo "ERROR: missing BATCH_ID"
  echo "Usage: $0 <BATCH_ID> [<INVOICE_ID>]"
  exit 2
fi
BATCH_ID="$1"
INVOICE_ID="${2:-$BATCH_ID}"
BATCH_DIR="$ALJEEL_HOME/batches/jawal-$BATCH_ID"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%SZ)
RUN_LOG="$ALJEEL_HOME/qc/reports/run-${BATCH_ID}-${TIMESTAMP}-hybrid.log"
mkdir -p "$(dirname "$RUN_LOG")"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$RUN_LOG"; }
die() { log "FATAL: $*"; exit 1; }

cd "$ALJEEL_HOME"

log "==============================================================="
log "AlJeel AP Jawal Hybrid Pipeline - $PIPELINE_VERSION"
log "Batch:      $BATCH_ID"
log "Invoice id: $INVOICE_ID"
log "Started:    $(date -u --iso-8601=seconds)"
log "==============================================================="

[ -d "$BATCH_DIR" ] || die "batch dir missing: $BATCH_DIR"
[ -f "$ENV_FILE" ]  || die "env file missing: $ENV_FILE"

set -a; source "$ENV_FILE"; set +a
if [ -z "${GEMINI_API_KEY:-}" ]; then die "GEMINI_API_KEY not in env"; fi
export PYTHONPATH="$ALJEEL_HOME/scripts:${PYTHONPATH:-}"

# Stage A: cascade (only if v15.11* output is missing)
CASCADE_OUTPUT=$(find -L "$BATCH_DIR/output" -maxdepth 1 -name "Spreadsheet-${INVOICE_ID}-FILLED-v15.11*.xlsx" -type f 2>/dev/null | sort | tail -1 || true)
if [ -z "$CASCADE_OUTPUT" ]; then
  log ""
  log "-- Stage A: deterministic cascade --"
  bash "$ALJEEL_HOME/PROCESS/run_jawal_batch.sh" "$INVOICE_ID" 2>&1 | tee -a "$RUN_LOG"
  CASCADE_EXIT=${PIPESTATUS[0]}
  [ "$CASCADE_EXIT" -eq 0 ] || die "cascade stage failed exit=$CASCADE_EXIT"
  CASCADE_OUTPUT=$(find -L "$BATCH_DIR/output" -maxdepth 1 -name "Spreadsheet-${INVOICE_ID}-FILLED-v15.11*.xlsx" -type f | sort | tail -1)
  [ -n "$CASCADE_OUTPUT" ] || die "cascade output not produced"
else
  log "Reusing existing cascade output: $(basename "$CASCADE_OUTPUT")"
fi

# Stage B: hybrid LLM agent
log ""
log "-- Stage B: hybrid LLM agent --"
EXTRA_ARGS=()
if [ "$INVOICE_ID" != "$BATCH_ID" ]; then
  EXTRA_ARGS+=(--invoice-id "$INVOICE_ID")
fi
python3 -u "$ALJEEL_HOME/scripts/run_hybrid_v15_12.py" "$BATCH_ID" "${EXTRA_ARGS[@]}" --workers 5 2>&1 | tee -a "$RUN_LOG"
HYBRID_EXIT=${PIPESTATUS[0]}
[ "$HYBRID_EXIT" -eq 0 ] || die "hybrid stage failed exit=$HYBRID_EXIT"

OUTPUT_XLSX="$BATCH_DIR/output/Spreadsheet-${INVOICE_ID}-FILLED-v15.12.xlsx"
[ -f "$OUTPUT_XLSX" ] || die "hybrid output missing: $OUTPUT_XLSX"
SUMMARY_JSON="$BATCH_DIR/output/summary-v15.12.json"

log ""
log "==============================================================="
log "DONE - Batch $BATCH_ID processed via $PIPELINE_VERSION"
log "Cascade input:  $(basename "$CASCADE_OUTPUT")"
log "Hybrid output:  $OUTPUT_XLSX"
log "Summary:        $SUMMARY_JSON"
log "Log:            $RUN_LOG"
log "==============================================================="

if [ -f "$SUMMARY_JSON" ]; then
  python3 -c "
import json
d = json.load(open('$SUMMARY_JSON'))
print('Routed to LLM:', d.get('routed_to_llm'), '/', d.get('total_rows'), 'rows')
print('Methods:', d.get('method_counts'))
print('LLM cost (est): \$' + str(d.get('cost_usd_est_at_3pro_pricing', 0)))
print('Runtime:', d.get('runtime_sec'), 's')
print('LLM errors:', d.get('llm_errors'))
print('Cluster-unified rows:', d.get('cluster_unified_rows'))
"
fi
