#!/bin/bash
# parallel-reindex.sh — one-shot parallel reindex of unprocessed KB files
#
# Usage: ./parallel-reindex.sh [WORKERS=4]
#
# Reads env from /etc/kb-sync.env (TENANT, BUCKET, VOLUME, GEMINI_API_KEY).
# Finds every file in the KB volume that doesn't yet have a corresponding wiki source page,
# splits the list into N worker queues, and runs extract+ingest in parallel.

set -uo pipefail
exec >> /var/log/kb-sync.log 2>&1

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(ts)] [parallel] $*"; }

set -a
source /etc/kb-sync.env
set +a

WORKERS=${1:-4}
CURRENT="$VOLUME/current"
STAGING="$VOLUME/.wiki-staging"
QUEUE_DIR="$VOLUME/.parallel-queue"
WIKI_DIR=/home/clawdbot/.openclaw/wiki/main/sources

mkdir -p "$STAGING" "$QUEUE_DIR"
chown -R clawdbot:clawdbot "$STAGING" "$QUEUE_DIR"
rm -f "$QUEUE_DIR"/queue-*.txt

log "=== parallel-reindex start (tenant=$TENANT, workers=$WORKERS) ==="

# Build the list of every KB file that's text-extractable.
# Then filter out those whose corresponding wiki source page already exists AND has been
# modified in the current reindex window (since 02:16 UTC today, the trigger point).
SINCE="2026-05-22 02:16:00"
ALL_FILES=$(find "$CURRENT" -type f \( \
  -iname '*.pdf' -o -iname '*.docx' -o -iname '*.doc' -o -iname '*.dot' -o -iname '*.dotx' \
  -o -iname '*.rtf' -o -iname '*.odt' -o -iname '*.xlsx' -o -iname '*.xls' -o -iname '*.csv' \
  -o -iname '*.pptx' -o -iname '*.ppt' -o -iname '*.potx' -o -iname '*.pot' -o -iname '*.odp' \
  -o -iname '*.md' -o -iname '*.txt' -o -iname '*.html' -o -iname '*.json' -o -iname '*.log' \
  -o -iname '*.eml' -o -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' \
  -o -iname '*.tiff' -o -iname '*.tif' -o -iname '*.bmp' -o -iname '*.webp' \
\))

# Filter: only files NOT already processed in this window
TODO=()
SKIP=0
while IFS= read -r f; do
  [ -z "$f" ] && continue
  SIZE=$(stat -c%s "$f" 2>/dev/null || echo 0)
  if [ "$SIZE" -gt 104857600 ]; then
    log "skip too-large >100MB: $f"
    continue
  fi
  # Compute the expected wiki source page slug (mirrors openclaw's slug rule: basename lowercase, [^a-z0-9] → -, collapse, trim)
  BASE=$(basename "$f" | tr '[:upper:]' '[:lower:]' | sed 's/\./-/g; s/[^a-z0-9-]/-/g; s/-\+/-/g; s/^-//; s/-$//')
  EXPECTED="$WIKI_DIR/${BASE}.md"
  # If the expected wiki page exists AND was modified within this run, skip
  if [ -f "$EXPECTED" ] && find "$EXPECTED" -newermt "$SINCE" 2>/dev/null | grep -q .; then
    SKIP=$((SKIP+1))
    continue
  fi
  TODO+=("$f")
done <<< "$ALL_FILES"

TOTAL=${#TODO[@]}
log "files queued: $TOTAL, skipped already-processed: $SKIP"

if [ "$TOTAL" -eq 0 ]; then
  log "=== nothing to do, exiting ==="
  exit 0
fi

# Split into N worker queues round-robin
for i in $(seq 0 $((WORKERS - 1))); do
  > "$QUEUE_DIR/queue-$i.txt"
done
for i in "${!TODO[@]}"; do
  W=$((i % WORKERS))
  printf '%s\n' "${TODO[$i]}" >> "$QUEUE_DIR/queue-$W.txt"
done

log "queues built:"
for i in $(seq 0 $((WORKERS - 1))); do
  log "  queue-$i: $(wc -l < "$QUEUE_DIR/queue-$i.txt") files"
done

# Worker function (runs in background per worker)
worker() {
  local id=$1
  local queue="$QUEUE_DIR/queue-$id.txt"
  local done=0
  local errs=0
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    EXT=$(echo "${f##*.}" | tr 'A-Z' 'a-z')
    case "$EXT" in
      pdf|docx|doc|dot|dotx|rtf|odt|xlsx|xls|csv|md|txt|html|json|log|eml|png|jpg|jpeg|tiff|tif|bmp|webp|pptx|ppt|potx|pot|odp)
        ;;
      *)
        log "[w$id] skip ext .$EXT: $f"
        continue
        ;;
    esac
    staged=$(sudo -u clawdbot --preserve-env=GEMINI_API_KEY,REGENT_OCR_MODELS node /usr/local/bin/extract-one.mjs "$f" "$STAGING" 2>>/var/log/kb-sync.log || echo '')
    if [ -n "$staged" ] && [ -f "$staged" ]; then
      sudo -u clawdbot openclaw wiki ingest "$staged" 2>&1 | tail -1
      done=$((done+1))
    else
      log "[w$id] extract failed: $f"
      errs=$((errs+1))
    fi
  done < "$queue"
  log "[w$id] complete: $done ingested, $errs errors"
}

# Launch all workers in parallel
log "launching $WORKERS workers..."
for i in $(seq 0 $((WORKERS - 1))); do
  worker $i &
done
wait
log "=== all workers complete ==="

# Final memory index
log "running: openclaw memory index --force"
sudo -u clawdbot openclaw memory index --force 2>&1 | tail -2 || log "memory index failed"

# Update sync state file
CURRENT_HASH=$(cd "$CURRENT" && find . -type f -exec sha256sum {} \; 2>/dev/null | sort | sha256sum | awk '{print $1}')
echo "{\"last_hash\":\"$CURRENT_HASH\",\"changed_at\":\"$(ts)\"}" > "$VOLUME/.sync-state.json"
cp "$VOLUME/.sync-state.json" "$VOLUME/.sync-state.json.previous" 2>/dev/null

log "=== parallel-reindex done ==="
