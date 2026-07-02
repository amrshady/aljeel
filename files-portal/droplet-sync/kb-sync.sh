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

LOG=/var/log/kb-sync.log
exec >> "$LOG" 2>&1

# Single-instance lock: if another kb-sync is already running, exit cleanly.
LOCK=/var/run/kb-sync.lock
exec 9>"$LOCK"
if ! flock -n 9; then
  echo "[$(date -u +'%Y-%m-%dT%H:%M:%SZ')] another sync in progress, skipping this run"
  exit 0
fi

ts() { date -u +'%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "[$(ts)] $*"; }

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

# Sync new + updated objects from Spaces → /mnt/<volume>/current/
sudo -u clawdbot rclone copy "spaces:${BUCKET}/current/" "$CURRENT/" \
  --transfers 4 \
  --update \
  --stats-one-line \
  --stats 30s 2>&1 | tail -3 || log "rclone copy failed (continuing)"

# 1b. Aljeel-only: pull the isolated Asateel prefix into a subfolder of the
# same KB dir so the AP agent indexes it alongside Jawal (tab-isolated in Spaces,
# unified in the agent KB). Only runs for the aljeel-ap bucket.
if [ "$BUCKET" = "accord-aljeel-ap-kb" ]; then
  mkdir -p "$CURRENT/asateel"
  sudo -u clawdbot rclone copy "spaces:${BUCKET}/asateel/current/" "$CURRENT/asateel/" \
    --transfers 4 \
    --update \
    --stats-one-line \
    --stats 30s 2>&1 | tail -3 || log "asateel rclone copy failed (continuing)"
fi

# 2. Sync removals: get list of objects in Spaces, find local files that aren't there → move to archive
LOCAL_FILES=$(cd "$CURRENT" && find . -type f -printf '%P\n' 2>/dev/null | sort)
LOCAL_MAIN_FILES=$(printf '%s\n' "$LOCAL_FILES" | grep -v '^asateel/' || true)
LOCAL_ASATEEL_FILES=$(printf '%s\n' "$LOCAL_FILES" | grep '^asateel/' || true)
REMOTE_MAIN=$(sudo -u clawdbot rclone lsf --files-only -R "spaces:${BUCKET}/current/" 2>/dev/null)
REMOTE_MAIN_STATUS=$?
REMOTE_ASATEEL=""
REMOTE_ASATEEL_STATUS=0

if [ "$BUCKET" = "accord-aljeel-ap-kb" ]; then
  REMOTE_ASATEEL=$(sudo -u clawdbot rclone lsf --files-only -R "spaces:${BUCKET}/asateel/current/" 2>/dev/null | sed 's#^#asateel/#')
  REMOTE_ASATEEL_STATUS=$?
fi

if [ "$REMOTE_MAIN_STATUS" -ne 0 ]; then
  log "warning: skipping removal sweep because remote listing failed: spaces:${BUCKET}/current/"
elif [ -n "$LOCAL_MAIN_FILES" ] && [ -z "$REMOTE_MAIN" ]; then
  log "warning: skipping removal sweep because remote listing is empty while local files exist: spaces:${BUCKET}/current/"
elif [ "$REMOTE_ASATEEL_STATUS" -ne 0 ]; then
  log "warning: skipping removal sweep because remote listing failed: spaces:${BUCKET}/asateel/current/"
elif [ "$BUCKET" = "accord-aljeel-ap-kb" ] && [ -n "$LOCAL_ASATEEL_FILES" ] && [ -z "$REMOTE_ASATEEL" ]; then
  log "warning: skipping removal sweep because remote listing is empty while local asateel files exist: spaces:${BUCKET}/asateel/current/"
else
  REMOTE_FILES=$(printf '%s\n%s\n' "$REMOTE_MAIN" "$REMOTE_ASATEEL" | sed '/^$/d' | sort)
  removed=$(comm -23 <(echo "$LOCAL_FILES") <(echo "$REMOTE_FILES"))
  if [ -n "$removed" ]; then
    while IFS= read -r f; do
      [ -z "$f" ] && continue
      dest="$ARCHIVE/$(date -u +%Y-%m-%d)/$f"
      mkdir -p "$(dirname "$dest")"
      mv "$CURRENT/$f" "$dest" 2>/dev/null && log "archived (removed remotely): $f"
    done <<< "$removed"
  fi
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
