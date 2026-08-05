#!/usr/bin/env bash
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
SYNC=$HERE/kb-sync.sh
TIMER=$HERE/kb-sync.timer
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
OWNER=$(id -u):$(id -g)
tests=0
fail() { echo "FAIL: $*" >&2; exit 1; }
ok() { tests=$((tests + 1)); echo "ok $tests - $*"; }

grep -q '^OnUnitInactiveSec=5min$' "$TIMER" || fail 'timer regression'
! grep -q '^OnUnitActiveSec=60s$' "$TIMER" || fail 'old timer cadence remains'
grep -q 'MIN_FREE_BYTES=\$((8 \* 1024 \* 1024 \* 1024))' "$SYNC" || fail '8 GiB preflight missing'
grep -q -- '--retries 1' "$SYNC" || fail 'one-rclone-retry policy missing'

mkdir -p "$TMP/bin"
cat > "$TMP/bin/sudo" <<'MOCK'
#!/bin/bash
if [ "${1:-}" = -u ]; then shift 2; fi
exec "$@"
MOCK
cat > "$TMP/bin/df" <<'MOCK'
#!/bin/bash
printf 'Filesystem 1-blocks Used Available Capacity Mounted on\nmock 20000000000 1 19999999999 1%% /mock\n'
MOCK
cat > "$TMP/bin/rclone" <<'MOCK'
#!/bin/bash
command=${1:-}; remote=''
for arg in "$@"; do case $arg in spaces:*) remote=$arg ;; esac; done
if [ "$command" = copy ]; then
  printf '%s\n' "$remote" >> "${MOCK_COPY_LOG:?}"
  if [ "${MOCK_COPY_FAILURE:-0}" = 1 ]; then exit 23; fi
  exit 0
fi
[ "$command" = lsf ] || exit 2
printf '%s\n' "$remote" >> "${MOCK_LIST_LOG:?}"
if [ "${MOCK_LIST_FAILURE:-0}" = 1 ]; then exit 23; fi
case "$remote" in
  *'/asateel/current/') printf 'invoice.pdf\n' ;;
  *'/current/') : ;;
  *) exit 2 ;;
esac
MOCK
cat > "$TMP/bin/rx-bytes" <<'MOCK'
#!/bin/bash
state=${RX_STATE:?}; n=0; [ ! -f "$state" ] || read -r n < "$state"
n=$((n + 1)); printf '%s\n' "$n" > "$state"
if [ "$n" -eq 1 ]; then echo 1000; else echo "${RX_END:-6000}"; fi
MOCK
chmod +x "$TMP/bin/"*

run_sync() {
  local volume=$1
  env PATH="$TMP/bin:/usr/bin:/bin" TENANT=aljeel-ap BUCKET=accord-aljeel-ap-kb VOLUME="$volume" \
    LOG="$TMP/kb-sync.log" LOCK="$TMP/kb-sync.lock" WATCHDOG_STATE_DIR="$TMP/watchdog" \
    METRICS_FILE="$TMP/watchdog/metrics.tsv" TELEMETRY_OWNER="$OWNER" RX_BYTES_CMD="$TMP/bin/rx-bytes" \
    RX_STATE="$TMP/rx-state" RX_END="${RX_END:-6000}" SUDO_CMD="$TMP/bin/sudo" RCLONE_CMD="$TMP/bin/rclone" \
    MOCK_COPY_LOG="$TMP/copy.log" MOCK_LIST_LOG="$TMP/list.log" MOCK_COPY_FAILURE="${MOCK_COPY_FAILURE:-0}" \
    MOCK_LIST_FAILURE="${MOCK_LIST_FAILURE:-0}" "$SYNC"
}
reset_case() { rm -rf "$TMP/watchdog" "$TMP/rx-state"; : > "$TMP/copy.log"; : > "$TMP/list.log"; : > "$TMP/kb-sync.log"; }

reset_case
volume_ok=$TMP/volume-ok; mkdir -p "$volume_ok/current/asateel" "$volume_ok/archive"; echo fixture > "$volume_ok/current/asateel/invoice.pdf"
run_sync "$volume_ok" || { tail -n 20 "$TMP/kb-sync.log" >&2; fail 'dual-namespace sync failed'; }
grep -Fxq 'spaces:accord-aljeel-ap-kb/current/' "$TMP/list.log" || fail 'current namespace not listed'
grep -Fxq 'spaces:accord-aljeel-ap-kb/asateel/current/' "$TMP/list.log" || fail 'Asateel namespace not listed'
[ -f "$volume_ok/current/asateel/invoice.pdf" ] || fail 'Asateel object falsely removed'
[ "$(wc -l < "$TMP/watchdog/metrics.tsv")" -eq 1 ] || fail 'success telemetry duplicated'
grep -Eq $'^[0-9]+\t5000\tsuccess$' "$TMP/watchdog/metrics.tsv" || fail 'success telemetry incorrect'
ok 'namespace/removal regression and successful copy telemetry'

reset_case
volume_copy_fail=$TMP/volume-copy-fail; mkdir -p "$volume_copy_fail/current" "$volume_copy_fail/archive"
if MOCK_COPY_FAILURE=1 RX_END=4500 run_sync "$volume_copy_fail"; then fail 'copy failure returned success'; fi
[ "$(wc -l < "$TMP/watchdog/metrics.tsv")" -eq 1 ] || fail 'failure telemetry duplicated'
grep -Eq $'^[0-9]+\t3500\tfailure$' "$TMP/watchdog/metrics.tsv" || fail 'failed-copy telemetry incorrect'
ok 'failed copy records observed bytes once without network'

reset_case
volume_list_fail=$TMP/volume-list-fail; mkdir -p "$volume_list_fail/current" "$volume_list_fail/archive"; echo keep > "$volume_list_fail/current/local-only.pdf"
if MOCK_LIST_FAILURE=1 run_sync "$volume_list_fail"; then fail 'listing failure returned success'; fi
[ -f "$volume_list_fail/current/local-only.pdf" ] || fail 'listing failure removed local file'
! find "$volume_list_fail/archive" -type f -print -quit | grep -q . || fail 'listing failure archived local file'
[ "$(wc -l < "$TMP/watchdog/metrics.tsv")" -eq 1 ] || fail 'listing failure should retain one completed copy observation'
ok 'remote listing failure remains fail-closed for removals'

printf 'PASS: %d kb-sync tests\n' "$tests"
