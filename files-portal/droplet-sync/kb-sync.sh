#!/bin/bash
# kb-sync.sh — pulls Spaces bucket → local KB volume, runs every 60s via systemd timer.
# Logs to /var/log/kb-sync.log
#
# Usage on each droplet:
#   TENANT=maher BUCKET=regent-maher-kb VOLUME=/mnt/maher_kb ./kb-sync.sh
#
# Required env:
#   TENANT     — slug (maher / marwan / aljeel-ap)
#   BUCKET     — Spaces bucket name
#   VOLUME     — local volume mount point (must have current/ and archive/ subdirs)
#   FILES_API  — base URL for the Files Worker (e.g. https://regent-files.pages.dev/api)
#   SYNC_TOKEN — shared secret (matches DROPLET_SYNC_TOKEN in Worker env)

# Note: we deliberately don't 'set -e' here. Individual file extraction failures
# (e.g. mammoth choking on a legacy .doc, Gemini OCR timing out on one PDF)
# should NOT kill the whole sync. Each file is wrapped with || true.
set -uo pipefail

LOG=${LOG:-/var/log/kb-sync.log}
exec >> "$LOG" 2>&1

# Single-instance lock: if another kb-sync is already running, exit cleanly.
LOCK=${LOCK:-/var/run/kb-sync.lock}
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] another sync in progress, skipping this run"
  exit 0
fi

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(ts)] $*"; }

# The watchdog consumes this machine-readable, append-only telemetry instead of
# rclone's human-formatted output. RX bytes are deliberately conservative: they
# include all traffic received on the default interface during both copy phases.
WATCHDOG_STATE_DIR=${WATCHDOG_STATE_DIR:-/var/lib/kb-sync-watchdog}
METRICS_FILE=${METRICS_FILE:-$WATCHDOG_STATE_DIR/metrics.tsv}
RX_BYTES_CMD=${RX_BYTES_CMD:-}
SUDO_CMD=${SUDO_CMD:-sudo}
RCLONE_CMD=${RCLONE_CMD:-rclone}
TELEMETRY_OWNER=${TELEMETRY_OWNER:-root:root}
telemetry_recorded=0

read_rx_bytes() {
  if [ -n "$RX_BYTES_CMD" ]; then
    "$RX_BYTES_CMD"
    return
  fi
  local iface
  iface=$(awk '$2 == "00000000" && $4 ~ /[37BF]$/ { print $1; exit }' /proc/net/route)
  [ -n "$iface" ] && cat "/sys/class/net/$iface/statistics/rx_bytes"
}

prepare_telemetry() {
  install -d -m 0750 "$WATCHDOG_STATE_DIR" || return 1
  chown "$TELEMETRY_OWNER" "$WATCHDOG_STATE_DIR" || return 1
  touch "$METRICS_FILE" || return 1
  chown "$TELEMETRY_OWNER" "$METRICS_FILE" || return 1
  chmod 0640 "$METRICS_FILE" || return 1
}

record_copy_observation() {
  local status=$1 end_rx delta end_epoch
  [ "$telemetry_recorded" -eq 0 ] || return 0
  end_rx=$(read_rx_bytes) || { log "unable to read ending RX counter"; return 1; }
  case $end_rx in ''|*[!0-9]*) log "invalid ending RX counter: $end_rx"; return 1 ;; esac
  if [ "$end_rx" -ge "$COPY_START_RX" ]; then delta=$((end_rx - COPY_START_RX)); else delta=0; fi
  end_epoch=$(date -u +%s)
  exec 8>>"$METRICS_FILE" || return 1
  flock -x 8 || return 1
  printf '%s\t%s\t%s\n' "$end_epoch" "$delta" "$status" >&8 || return 1
  telemetry_recorded=1
  log "copy telemetry end_epoch=$end_epoch rx_bytes=$delta status=$status"
}

: "${TENANT:?TENANT required}"
: "${BUCKET:?BUCKET required}"
: "${VOLUME:?VOLUME required}"

CURRENT="$VOLUME/current"
ARCHIVE="$VOLUME/archive"
STATE_FILE="$VOLUME/.sync-state.json"
mkdir -p "$CURRENT" "$ARCHIVE"

log "=== sync start tenant=$TENANT bucket=$BUCKET ==="

# 1. Pull Spaces → local volume (rclone handles deletes via --max-age tracking)
# We DON'T --delete because: any file deleted from Spaces should land in archive/, not vanish.
# Worker handles archive flag via KV; on sync, we read the archive list from API and move locally.

# Fail closed before any download if the volume is near capacity. This prevents
# a failed sync from repeatedly burning Spaces egress while it can never commit files.
FREE_BYTES=$(df -PB1 "$VOLUME" | awk 'NR==2 {print $4}')
MIN_FREE_BYTES=$((8 * 1024 * 1024 * 1024))
if [ "${FREE_BYTES:-0}" -lt "$MIN_FREE_BYTES" ]; then
  log "insufficient free space (${FREE_BYTES:-0} bytes; need >= ${MIN_FREE_BYTES}) — aborting before rclone"
  exit 1
fi

if ! prepare_telemetry; then
  log "unable to prepare watchdog telemetry — aborting before rclone"
  exit 1
fi
COPY_START_RX=$(read_rx_bytes) || { log "unable to read starting RX counter — aborting before rclone"; exit 1; }
case $COPY_START_RX in ''|*[!0-9]*) log "invalid starting RX counter — aborting before rclone"; exit 1 ;; esac

# Sync new + updated objects from Spaces → /mnt/<volume>/current/.
# One attempt only: systemd is already the retry layer.
if ! "$SUDO_CMD" -u clawdbot "$RCLONE_CMD" copy "spaces:${BUCKET}/current/" "$CURRENT/" \
  --transfers 4 \
  --retries 1 \
  --update \
  --stats-one-line \
  --stats 30s 2>&1 | tail -3; then
  record_copy_observation failure || log "failed to record copy telemetry"
  log "rclone copy failed — aborting this run"
  exit 1
fi

# 1b. Aljeel-only: pull the isolated Asateel prefix into a subfolder of the
# same KB dir so the AP agent indexes it alongside Jawal (tab-isolated in Spaces,
# unified in the agent KB). Only runs for the aljeel-ap bucket.
if [ "$BUCKET" = "accord-aljeel-ap-kb" ]; then
  mkdir -p "$CURRENT/asateel"
  if ! "$SUDO_CMD" -u clawdbot "$RCLONE_CMD" copy "spaces:${BUCKET}/asateel/current/" "$CURRENT/asateel/" \
    --transfers 4 \
    --retries 1 \
    --update \
    --stats-one-line \
    --stats 30s 2>&1 | tail -3; then
    record_copy_observation failure || log "failed to record copy telemetry"
    log "asateel rclone copy failed — aborting this run"
    exit 1
  fi
fi

if ! record_copy_observation success; then
  log "failed to record completed copy telemetry — aborting this run"
  exit 1
fi

# 2. Sync removals: compare local files against BOTH remote namespaces.
# Previously Asateel lived locally under current/asateel/ but the remote list only
# included bucket/current/. Every Asateel file was therefore falsely archived and
# downloaded again on the next 60-second run.
LOCAL_FILES=$(cd "$CURRENT" && find . -type f -printf '%P\n' 2>/dev/null | sort)
REMOTE_TMP=$(mktemp)
trap 'rm -f "$REMOTE_TMP"' EXIT
if ! sudo -u clawdbot rclone lsf --files-only -R "spaces:${BUCKET}/current/" > "$REMOTE_TMP"; then
  log "remote current listing failed — refusing removal pass"
  exit 1
fi
if [ "$BUCKET" = "accord-aljeel-ap-kb" ]; then
  ASATEEL_TMP=$(mktemp)
  if ! sudo -u clawdbot rclone lsf --files-only -R "spaces:${BUCKET}/asateel/current/" > "$ASATEEL_TMP"; then
    rm -f "$ASATEEL_TMP"
    log "remote Asateel listing failed — refusing removal pass"
    exit 1
  fi
  sed 's#^#asateel/#' "$ASATEEL_TMP" >> "$REMOTE_TMP"
  rm -f "$ASATEEL_TMP"
fi
REMOTE_FILES=$(sort -u "$REMOTE_TMP")

removed=$(comm -23 <(echo "$LOCAL_FILES") <(echo "$REMOTE_FILES"))
if [ -n "$removed" ]; then
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    dest="$ARCHIVE/$(date -u +%Y-%m-%d)/$f"
    mkdir -p "$(dirname "$dest")"
    mv "$CURRENT/$f" "$dest" 2>/dev/null && log "archived (removed remotely): $f"
  done <<< "$removed"
fi

# 3. Apply KV archive flags: any file marked archived in the Worker KV
#    should be moved from /current/ to /archive/ locally so the bot stops indexing it.
if [ -n "${FILES_API:-}" ]; then
  ARCHIVED_JSON=$(curl -fsS -H "x-sync-token: ${SYNC_TOKEN:-none}" \
    "${FILES_API}/files?tenant=${TENANT}" 2>/dev/null || echo '{}')
  archived=$(echo "$ARCHIVED_JSON" | jq -r '.files[]? | select(.archived == true) | .path' 2>/dev/null || true)

  if [ -n "$archived" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      if [ -f "$CURRENT/$f" ]; then
        dest="$ARCHIVE/$(date -u +%Y-%m-%d)/$f"
        mkdir -p "$(dirname "$dest")"
        mv "$CURRENT/$f" "$dest"
        log "archived (KV flag): $f"
      fi
    done <<< "$archived"
  fi

  # Inversely: any file marked NOT archived but currently in /archive/ → restore
  # (handled implicitly on next rclone copy because Spaces still has it under /current/)
fi

# 4. KB change detection — hash + diff against last state
CURRENT_HASH=$(cd "$CURRENT" && find . -type f -exec sha256sum {} \; 2>/dev/null | sort | sha256sum | awk '{print $1}')
LAST_HASH=$(jq -r .last_hash "$STATE_FILE" 2>/dev/null || echo "")

if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
  log "KB changed (hash $LAST_HASH → $CURRENT_HASH) — triggering reindex + wiki reingest"

  # Touch a marker file the bot reads on next memory-index call
  touch "$VOLUME/.kb-changed-at"
  echo "{\"last_hash\":\"$CURRENT_HASH\",\"changed_at\":\"$(ts)\"}" > "$STATE_FILE"

  if command -v openclaw &>/dev/null; then
    # Find which files actually changed since last sync (by mtime newer than state file)
    if [ -f "$STATE_FILE.previous" ]; then
      changed_files=$(find "$CURRENT" -type f -newer "$STATE_FILE.previous" 2>/dev/null)
    else
      changed_files=$(find "$CURRENT" -type f 2>/dev/null)  # first run: ingest everything
    fi

    # Extraction + ingest pipeline:
    #   1. Run extract-one.mjs to convert binary (pdf/docx/xlsx/eml) to .md
    #   2. Pipe the staged .md into `openclaw wiki ingest` (updates source page by ID in-place)
    STAGING="$VOLUME/.wiki-staging"
    mkdir -p "$STAGING"
    chown -R clawdbot:clawdbot "$STAGING"

    while IFS= read -r f; do
      [ -z "$f" ] && continue
      ext="${f##*.}"
      ext_lower=$(echo "$ext" | tr 'A-Z' 'a-z')
      case "$ext_lower" in
        pdf|docx|doc|dot|dotx|rtf|odt|xlsx|xls|csv|md|txt|html|json|log|eml|png|jpg|jpeg|tiff|tif|bmp|webp|pptx|ppt|potx|pot|odp)
          size=$(stat -c%s "$f" 2>/dev/null || echo 0)
          if [ "$size" -gt 104857600 ]; then
            log "skip ingest (too large >100MB): $f"
            continue
          fi
          log "extract+ingest: $f"
          # extract-one.mjs may log diagnostics to stderr; only the final stdout line is the staged path.
          # sudo --preserve-env passes GEMINI_API_KEY through (sudoers strips env by default).
          # `|| true` ensures one bad file (e.g. legacy .doc, corrupt PDF, OCR timeout) doesn't kill the whole sync.
          staged_path=$(sudo -u clawdbot --preserve-env=GEMINI_API_KEY,REGENT_OCR_MODELS node /usr/local/bin/extract-one.mjs "$f" "$STAGING" 2>>/var/log/kb-sync.log || echo '')
          if [ -n "$staged_path" ] && [ -f "$staged_path" ]; then
            sudo -u clawdbot openclaw wiki ingest "$staged_path" 2>&1 | tail -1 || log "  ingest failed: $f"
          else
            log "  extract failed (skipping): $f"
          fi
          ;;
        *)
          log "skip ingest (unsupported ext .$ext): $f"
          ;;
      esac
    done <<< "$changed_files"

    # Snapshot the state file for next run's mtime comparison
    cp "$STATE_FILE" "$STATE_FILE.previous" 2>/dev/null || true

    log "running: openclaw memory index --force"
    sudo -u clawdbot openclaw memory index --force 2>&1 | tail -2 || log "memory index failed"
  fi

  # Post webhook back to Worker so it can log + ping Telegram
  if [ -n "${FILES_API:-}" ]; then
    curl -sS -X POST -H "x-sync-token: ${SYNC_TOKEN:-none}" -H "Content-Type: application/json" \
      "${FILES_API}/sync-complete" \
      -d "{\"tenant\":\"${TENANT}\",\"hash\":\"${CURRENT_HASH}\",\"at\":\"$(ts)\"}" 2>&1 | tail -1
  fi
else
  log "no change (hash $CURRENT_HASH)"
fi

log "=== sync complete ==="
