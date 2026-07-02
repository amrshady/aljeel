#!/usr/bin/env bash
# AlJeel AP - Jawal Batch Processor v16
# Adds: TRAVEL_NO_EVIDENCE routing trigger + employee/sponsorship classifier (Flash, cheap)
#
# Usage:  bash PROCESS/run_jawal_batch_v16.sh <BATCH_ID> [<INVOICE_ID>]
# Examples:
#   bash PROCESS/run_jawal_batch_v16.sh J26-593-BLIND J26-593
#   bash PROCESS/run_jawal_batch_v16.sh J26-550
#
# Pipeline:
#   Stage A — v15.11.2 cascade (reused if already run)
#   Stage B — v16 hybrid:
#              · All v15.12 triggers unchanged
#              · NEW: TRAVEL_NO_EVIDENCE → classify (Flash) → full LLM resolve
#
# Hard rule: GEMINI_API_KEY direct, no LiteLLM proxy.

set -euo pipefail

ALJEEL_HOME="/home/clawdbot/.openclaw/workspace/aljeel"
ENV_FILE="/home/clawdbot/.openclaw/.env"
PIPELINE_VERSION="v16"

if [ $# -lt 1 ]; then
  echo "ERROR: missing BATCH_ID"
  echo "Usage: $0 <BATCH_ID> [<INVOICE_ID>]"
  exit 2
fi
BATCH_ID="$1"
INVOICE_ID="${2:-$BATCH_ID}"
BATCH_DIR="$ALJEEL_HOME/batches/jawal-$BATCH_ID"
TIMESTAMP=$(date -u +%Y%m%d-%H%M%SZ)
RUN_LOG="$ALJEEL_HOME/qc/reports/run-${BATCH_ID}-${TIMESTAMP}-v16.log"
mkdir -p "$(dirname "$RUN_LOG")"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$RUN_LOG"; }
die() { log "FATAL: $*"; exit 1; }

cd "$ALJEEL_HOME"

log "==============================================================="
log "AlJeel AP Jawal Pipeline - $PIPELINE_VERSION"
log "Batch:      $BATCH_ID"
log "Invoice id: $INVOICE_ID"
log "Started:    $(date -u --iso-8601=seconds)"
log "==============================================================="

[ -d "$BATCH_DIR" ] || die "batch dir missing: $BATCH_DIR"
[ -f "$ENV_FILE"  ] || die "env file missing: $ENV_FILE"

set -a; source "$ENV_FILE"; set +a
if [ -z "${GEMINI_API_KEY:-}" ]; then die "GEMINI_API_KEY not in env"; fi
export PYTHONPATH="$ALJEEL_HOME/scripts:${PYTHONPATH:-}"

# ── Stage A: cascade (skip if v15.11 output already exists) ─────────────────
CASCADE_OUTPUT=$(find -L "$BATCH_DIR/output" -maxdepth 1 \
  -name "Spreadsheet-${INVOICE_ID}-FILLED-v15.11*.xlsx" -type f 2>/dev/null \
  | sort | tail -1 || true)

if [ -z "$CASCADE_OUTPUT" ]; then
  log ""
  log "── Stage A: deterministic cascade (v15.11.2) ──"
  bash "$ALJEEL_HOME/PROCESS/run_jawal_batch.sh" "$INVOICE_ID" 2>&1 | tee -a "$RUN_LOG"
  CASCADE_EXIT=${PIPESTATUS[0]}
  [ "$CASCADE_EXIT" -eq 0 ] || die "cascade stage failed exit=$CASCADE_EXIT"
  CASCADE_OUTPUT=$(find -L "$BATCH_DIR/output" -maxdepth 1 \
    -name "Spreadsheet-${INVOICE_ID}-FILLED-v15.11*.xlsx" -type f | sort | tail -1)
  [ -n "$CASCADE_OUTPUT" ] || die "cascade output not produced"
else
  log "Reusing existing cascade output: $(basename "$CASCADE_OUTPUT")"
fi

# ── Stage B: v16 hybrid LLM ──────────────────────────────────────────────────
log ""
log "── Stage B: v16 hybrid (classify + resolve) ──"
EXTRA_ARGS=()
if [ "$INVOICE_ID" != "$BATCH_ID" ]; then
  EXTRA_ARGS+=(--invoice-id "$INVOICE_ID")
fi

python3 -u "$ALJEEL_HOME/scripts/run_hybrid_v16.py" \
  "$BATCH_ID" "${INVOICE_ID}" \
  --workers 4 2>&1 | tee -a "$RUN_LOG"
HYBRID_EXIT=${PIPESTATUS[0]}
[ "$HYBRID_EXIT" -eq 0 ] || die "v16 hybrid stage failed exit=$HYBRID_EXIT"

OUTPUT_XLSX="$BATCH_DIR/output/Spreadsheet-${INVOICE_ID}-FILLED-v16.xlsx"
[ -f "$OUTPUT_XLSX" ] || die "v16 output missing: $OUTPUT_XLSX"
SUMMARY_JSON="$BATCH_DIR/output/summary-v16.json"

log ""
log "==============================================================="
log "DONE - Batch $BATCH_ID processed via $PIPELINE_VERSION"
log "Cascade input:  $(basename "$CASCADE_OUTPUT")"
log "v16 output:     $OUTPUT_XLSX"
log "Summary:        $SUMMARY_JSON"
log "Log:            $RUN_LOG"
log "==============================================================="

if [ -f "$SUMMARY_JSON" ]; then
  python3 -c "
import json
d = json.load(open('$SUMMARY_JSON'))
print('Rows total:           ', d.get('total_rows'))
print('Routed to LLM:        ', d.get('routed_to_llm'), '/', d.get('total_rows'))
print('  of which TRAVEL_NO_EVIDENCE:', d.get('routing_reasons',{}).get('TRAVEL_NO_EVIDENCE',0))
print('Methods:              ', d.get('method_counts'))
print('Classify tokens (Flash):', d.get('classify_in_tokens',0), 'in /', d.get('classify_out_tokens',0), 'out')
print('Total cost est:       \$' + str(d.get('cost_usd_est', 0)))
print('Runtime:              ', d.get('runtime_sec'), 's')
print('LLM errors:           ', d.get('llm_errors'))
"
fi
