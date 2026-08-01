#!/usr/bin/env bash
set -euo pipefail

HERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
WATCHDOG=$HERE/kb-sync-watchdog.sh
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT INT TERM
mkdir -p "$TMP/bin"
NOW=2000000000
GIB=$((1024 * 1024 * 1024))
RUN_458=4917730017
OWNER=$(id -u):$(id -g)
tests=0

fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }
ok() { tests=$((tests + 1)); printf 'ok %d - %s\n' "$tests" "$*"; }
assert_trip() { grep -q 'TRIPPED' <<< "$1" || fail "expected trip: $1"; }

cat > "$TMP/bin/df" <<'MOCK'
#!/bin/sh
printf '%s\n' 'Filesystem 1-blocks Used Available Capacity Mounted on'
printf 'mock 20000000000 1 %s %s%% /mock\n' "${MOCK_DF_FREE:-19000000000}" "${MOCK_DF_PERCENT:-5}"
MOCK
cat > "$TMP/bin/systemctl" <<'MOCK'
#!/bin/sh
printf '%s\n' "$*" >> "${SYSTEMCTL_LOG:?}"
MOCK
chmod +x "$TMP/bin/df" "$TMP/bin/systemctl"

reset_case() {
  rm -rf "$TMP/state" "$TMP/archive"
  mkdir -p "$TMP/state" "$TMP/archive"
  : > "$TMP/systemctl.log"
  unset MOCK_DF_PERCENT MOCK_DF_FREE
}
metric() { printf '%s\t%s\t%s\n' "$1" "$2" "${3:-success}" >> "$TMP/state/metrics.tsv"; }
run_watchdog() {
  env STATE_DIR="$TMP/state" METRICS_FILE="$TMP/state/metrics.tsv" SENTINEL_FILE="$TMP/state/TRIPPED" \
    ARCHIVE_DIR="$TMP/archive" DF_TARGET=/mock DF_CMD="$TMP/bin/df" \
    SYSTEMCTL_CMD="$TMP/bin/systemctl" SYSTEMCTL_LOG="$TMP/systemctl.log" NOW_EPOCH="$NOW" \
    STATE_OWNER="$OWNER" DRY_RUN="${DRY_RUN:-1}" MOCK_DF_PERCENT="${MOCK_DF_PERCENT:-5}" \
    MOCK_DF_FREE="${MOCK_DF_FREE:-19000000000}" "$WATCHDOG" 2>&1
}

reset_case
out=$(run_watchdog); grep -q 'recent_runs=0' <<< "$out" || fail "no-history host not healthy"
ok 'healthy host with no telemetry history'

reset_case; metric "$NOW" "$RUN_458"
run_watchdog >/dev/null; ok 'one 4.58 GiB run remains healthy'

reset_case; metric "$((NOW - 60))" "$RUN_458"; metric "$NOW" "$RUN_458"
run_watchdog >/dev/null; ok 'two 4.58 GiB runs remain below rolling threshold'

reset_case; metric "$((NOW - 120))" "$RUN_458"; metric "$((NOW - 60))" "$RUN_458"; metric "$NOW" "$RUN_458"
out=$(run_watchdog || true); assert_trip "$out"; grep -q 'rolling 15-minute' <<< "$out"; ok 'three 4.58 GiB runs trip rolling threshold'

reset_case; metric "$NOW" "$((6 * GIB + 1))"
out=$(run_watchdog || true); assert_trip "$out"; grep -q 'single run' <<< "$out"; ok 'one run over 6 GiB trips'

reset_case
for offset in 10 20 30 40 50 60; do metric "$((NOW - offset))" 1024; done
run_watchdog >/dev/null; ok 'repeated tiny positive transfers remain healthy'

reset_case; export MOCK_DF_PERCENT=80
out=$(run_watchdog || true); assert_trip "$out"; ok 'disk used threshold trips'

reset_case; export MOCK_DF_FREE=$((8 * GIB - 1))
out=$(run_watchdog || true); assert_trip "$out"; ok 'low free-space threshold trips'

reset_case; mkdir -p "$TMP/archive/2026-08-01/asateel"
out=$(run_watchdog || true); assert_trip "$out"; ok 'duplicate Asateel archive directory trips'

reset_case
for n in $(seq 1 100); do : > "$TMP/archive/jawal-$n"; done
out=$(run_watchdog || true); assert_trip "$out"; ok 'recent Jawal archive file count trips'

reset_case; truncate -s "$GIB" "$TMP/archive/jawal-large"
out=$(run_watchdog || true); assert_trip "$out"; ok 'recent Jawal archive bytes trip'

reset_case; truncate -s "$GIB" "$TMP/archive/historical-jawal"; touch -d '20 minutes ago' "$TMP/archive/historical-jawal"
run_watchdog >/dev/null; ok 'historical Jawal archive content alone remains healthy'

reset_case; printf 'not\tvalid\n' > "$TMP/state/metrics.tsv"
out=$(run_watchdog || true); assert_trip "$out"; grep -q malformed <<< "$out"; ok 'malformed telemetry trips'

reset_case; printf 'original sentinel\n' > "$TMP/state/TRIPPED"
out=$(run_watchdog || true); assert_trip "$out"; grep -q 'already exists' <<< "$out"; grep -Fxq 'original sentinel' "$TMP/state/TRIPPED"; [ ! -s "$TMP/systemctl.log" ] || fail 'dry run called systemctl'
ok 'sentinel persists and repeated dry-run trip is deduped'

reset_case; metric "$NOW" "$((7 * GIB))"
out=$(run_watchdog || true); assert_trip "$out"; [ ! -e "$TMP/state/TRIPPED" ] || fail 'dry run created sentinel'; [ ! -s "$TMP/systemctl.log" ] || fail 'dry run called systemctl'
ok 'DRY_RUN never changes sentinel or calls systemctl'

reset_case; metric "$NOW" "$((7 * GIB))"; DRY_RUN=0 out=$(run_watchdog || true); unset DRY_RUN
[ -s "$TMP/state/TRIPPED" ] || fail 'real trip did not create sentinel'
grep -Fxq 'disable --now kb-sync.timer' "$TMP/systemctl.log" || fail 'real trip did not disable timer'
DRY_RUN=0 out=$(run_watchdog || true); unset DRY_RUN
[ "$(wc -l < "$TMP/systemctl.log")" -eq 1 ] || fail 'persistent sentinel repeated systemctl action'
ok 'real trip creates sentinel, disables timer once, and dedupes repeats'

printf 'PASS: %d watchdog tests\n' "$tests"
