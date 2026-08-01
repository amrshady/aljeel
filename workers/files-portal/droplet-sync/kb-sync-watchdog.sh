#!/usr/bin/env bash
set -euo pipefail

STATE_DIR=${STATE_DIR:-/var/lib/kb-sync-watchdog}
METRICS_FILE=${METRICS_FILE:-$STATE_DIR/metrics.tsv}
SENTINEL_FILE=${SENTINEL_FILE:-$STATE_DIR/TRIPPED}
ARCHIVE_DIR=${ARCHIVE_DIR:-/mnt/aljeel-ap_kb/archive}
SYNC_TIMER=${SYNC_TIMER:-kb-sync.timer}
DF_TARGET=${DF_TARGET:-/mnt/aljeel-ap_kb}
DF_CMD=${DF_CMD:-df}
SYSTEMCTL_CMD=${SYSTEMCTL_CMD:-systemctl}
NOW_EPOCH=${NOW_EPOCH:-$(date -u +%s)}
WINDOW_SECONDS=${WINDOW_SECONDS:-900}
SINGLE_RUN_BYTES=${SINGLE_RUN_BYTES:-6442450944}
ROLLING_BYTES=${ROLLING_BYTES:-10737418240}
MIN_FREE_BYTES=${MIN_FREE_BYTES:-8589934592}
ARCHIVE_FILE_LIMIT=${ARCHIVE_FILE_LIMIT:-100}
ARCHIVE_BYTES_LIMIT=${ARCHIVE_BYTES_LIMIT:-1073741824}
DRY_RUN=${DRY_RUN:-0}
STATE_OWNER=${STATE_OWNER:-root:root}

log() { printf '%s kb-sync-watchdog: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 2; }

for value in "$NOW_EPOCH" "$WINDOW_SECONDS" "$SINGLE_RUN_BYTES" "$ROLLING_BYTES" "$MIN_FREE_BYTES" "$ARCHIVE_FILE_LIMIT" "$ARCHIVE_BYTES_LIMIT"; do
  case $value in ''|*[!0-9]*) die "numeric configuration contains an invalid value" ;; esac
done
case $SYNC_TIMER in kb-sync.timer) ;; *) die "refusing to control unexpected unit: $SYNC_TIMER" ;; esac
case $DRY_RUN in 0|1) ;; *) die "DRY_RUN must be 0 or 1" ;; esac

trip() {
  local reason=$1 existing=0 tmp
  [ -e "$SENTINEL_FILE" ] && existing=1
  if [ "$DRY_RUN" = 1 ]; then
    log "TRIPPED (dry run): $reason"
    log "DRY_RUN: would atomically create $SENTINEL_FILE and run: $SYSTEMCTL_CMD disable --now $SYNC_TIMER"
    return 1
  fi
  if [ "$existing" -eq 0 ]; then
    install -d -m 0750 "$STATE_DIR"
    chown "$STATE_OWNER" "$STATE_DIR"
    tmp=$(mktemp "$STATE_DIR/.TRIPPED.XXXXXX")
    printf '%s\t%s\n' "$NOW_EPOCH" "$reason" > "$tmp"
    chmod 0640 "$tmp"
    if ln "$tmp" "$SENTINEL_FILE" 2>/dev/null; then
      rm -f "$tmp"
      log "TRIPPED: $reason; created sentinel=$SENTINEL_FILE"
      "$SYSTEMCTL_CMD" disable --now "$SYNC_TIMER"
    else
      rm -f "$tmp"
      log "TRIPPED: sentinel already exists; preserving first trip"
    fi
  else
    log "TRIPPED: sentinel already exists; preserving first trip"
  fi
  return 1
}

if [ -e "$SENTINEL_FILE" ]; then
  trip "persistent sentinel already exists" || exit 1
fi

df_line=$($DF_CMD -PB1 "$DF_TARGET" | awk 'NR==2 {gsub(/%/, "", $5); print $4, $5}') || die "df failed for $DF_TARGET"
read -r free_bytes used_pct <<< "$df_line"
case ${free_bytes:-}:${used_pct:-} in *[!0-9:]*|:*|*:) die "could not determine filesystem capacity for $DF_TARGET" ;; esac
if [ "$used_pct" -ge 80 ]; then trip "filesystem used ${used_pct}% is at or above 80%" || exit 1; fi
if [ "$free_bytes" -lt "$MIN_FREE_BYTES" ]; then trip "filesystem free bytes $free_bytes is below $MIN_FREE_BYTES" || exit 1; fi

if [ -d "$ARCHIVE_DIR" ] && find "$ARCHIVE_DIR" -mindepth 2 -type d -path '*/asateel' -print -quit | grep -q .; then
  trip "duplicate Asateel archive directory exists" || exit 1
fi

recent_archive_count=0
recent_archive_bytes=0
if [ -d "$ARCHIVE_DIR" ]; then
  archive_stats=$(find "$ARCHIVE_DIR" -type f -mmin -15 ! -path '*/asateel/*' -printf '%s\n' |
    awk '{count++; bytes += $1} END {print count + 0, bytes + 0}')
  read -r recent_archive_count recent_archive_bytes <<< "$archive_stats"
fi
if [ "$recent_archive_count" -ge "$ARCHIVE_FILE_LIMIT" ]; then
  trip "$recent_archive_count non-Asateel archive files appeared in 15 minutes" || exit 1
fi
if [ "$recent_archive_bytes" -ge "$ARCHIVE_BYTES_LIMIT" ]; then
  trip "$recent_archive_bytes bytes of non-Asateel archive data appeared in 15 minutes" || exit 1
fi

recent_runs=0
rolling_bytes=0
largest_bytes=0
if [ -e "$METRICS_FILE" ]; then
  [ -r "$METRICS_FILE" ] || { trip "required telemetry is unreadable: $METRICS_FILE" || exit 1; }
  if [ -s "$METRICS_FILE" ]; then
    metrics=$(awk -F '\t' -v now="$NOW_EPOCH" -v window="$WINDOW_SECONDS" '
      NF != 3 || $1 !~ /^[0-9]+$/ || $2 !~ /^[0-9]+$/ || ($3 != "success" && $3 != "failure") { bad=1; next }
      $1 > now + 60 { bad=1; next }
      $1 >= now - window && $1 <= now { key=$0; if (!seen[key]++) { count++; sum += $2; if ($2 > max) max=$2 } }
      END { if (bad) exit 3; print count + 0, sum + 0, max + 0 }
    ' "$METRICS_FILE") || { trip "required telemetry is malformed: $METRICS_FILE" || exit 1; }
    read -r recent_runs rolling_bytes largest_bytes <<< "$metrics"
  fi
fi

if [ "$largest_bytes" -ge "$SINGLE_RUN_BYTES" ]; then
  trip "single run received $largest_bytes bytes (threshold $SINGLE_RUN_BYTES)" || exit 1
fi
if [ "$rolling_bytes" -ge "$ROLLING_BYTES" ]; then
  trip "rolling 15-minute receive bytes $rolling_bytes reached $ROLLING_BYTES" || exit 1
fi

log "OK: recent_runs=$recent_runs rolling_rx_bytes=$rolling_bytes filesystem_used=${used_pct}% free_bytes=$free_bytes recent_archive_files=$recent_archive_count recent_archive_bytes=$recent_archive_bytes"
