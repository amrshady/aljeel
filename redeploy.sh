#!/usr/bin/env bash
# AlJeel AP Vendor Platform — one-command redeploy
# Pulls latest main, rebuilds web (+ api if changed), restarts services cleanly.
# Safe to run on every commit. Verifies API reachability so the
# "Cannot reach the API" mixed-content class of bug can't ship silently.
set -euo pipefail

REPO=/home/clawdbot/.openclaw/workspace/aljeel-repo
LOGDIR=/home/clawdbot/.openclaw/workspace/aljeel
PNPM=/home/clawdbot/.local/bin/pnpm
PUBLIC_HOST="https://ap-aljeel.accordpartners.ai"
WEB_PORT=3000
API_PORT=3002

log(){ printf '\n=== %s ===\n' "$*"; }

port_pids(){
  ss -ltnp 2>/dev/null | awk -v port="$1" '
    $4 ~ (":" port "$") {
      while (match($0, /pid=[0-9]+/)) {
        print substr($0, RSTART + 4, RLENGTH - 4)
        $0 = substr($0, RSTART + RLENGTH)
      }
    }
  ' | sort -u
}

port_listening(){
  ss -ltn 2>/dev/null | awk -v port="$1" '$4 ~ (":" port "$") { found=1 } END { exit found ? 0 : 1 }'
}

wait_for_port_free(){
  port="$1"
  for _ in $(seq 1 20); do
    if ! port_listening "$port"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

wait_for_port_bound(){
  port="$1"
  for _ in $(seq 1 20); do
    if port_listening "$port"; then
      return 0
    fi
    sleep 0.5
  done
  return 1
}

free_port(){
  port="$1"
  fallback_pattern="$2"
  pids="$(port_pids "$port" | xargs || true)"
  if [ -n "$pids" ]; then
    echo "killing listener(s) on :$port -> $pids"
    kill $pids 2>/dev/null || true
  elif [ -n "$fallback_pattern" ]; then
    echo "no listener pid found for :$port via ss; trying fallback pattern"
    pkill -f "$fallback_pattern" 2>/dev/null || true
  fi

  if wait_for_port_free "$port"; then
    return 0
  fi

  echo "port :$port still busy; forcing listener cleanup"
  pids="$(port_pids "$port" | xargs || true)"
  if [ -n "$pids" ]; then
    kill -9 $pids 2>/dev/null || true
  fi
  fuser -k "${port}/tcp" 2>/dev/null || true
  if [ -n "$fallback_pattern" ]; then
    pkill -f "$fallback_pattern" 2>/dev/null || true
  fi
  wait_for_port_free "$port"
}

log "Pulling latest main"
git -C "$REPO" fetch origin main
BEFORE=$(git -C "$REPO" rev-parse HEAD)
git -C "$REPO" pull --ff-only origin main
AFTER=$(git -C "$REPO" rev-parse HEAD)

# What changed (used to decide whether API needs a rebuild/restart)
CHANGED=$(git -C "$REPO" diff --name-only "$BEFORE" "$AFTER" || true)
echo "$CHANGED"

# --- Guard: web must talk to the API over the SAME HTTPS origin, never raw-IP HTTP.
# A raw http://IP:PORT baked into an HTTPS site = browser mixed-content block =
# "Cannot reach the API". Enforce the correct value on every deploy.
ENVFILE="$REPO/apps/web/.env.local"
WANT="NEXT_PUBLIC_API_URL=${PUBLIC_HOST}/api/v1"
if [ ! -f "$ENVFILE" ] || ! grep -qxF "$WANT" "$ENVFILE"; then
  log "Fixing web API URL (mixed-content guard)"
  printf '%s\n' "$WANT" > "$ENVFILE"
fi
echo "web env -> $(cat "$ENVFILE")"

# --- API: rebuild + restart only if apps/api or shared packages changed
if echo "$CHANGED" | grep -qE '^apps/api/|^packages/'; then
  log "API/shared changed — reinstalling + rebuilding API"
  "$PNPM" --dir "$REPO" install
  "$PNPM" --dir "$REPO" --filter @aljeel/api build
  log "Restarting API (:$API_PORT)"
  pkill -f 'dist/src/main.js' 2>/dev/null || true
  free_port "$API_PORT" 'dist/src/main.js' || { echo "!! API port :$API_PORT did not become free"; exit 1; }
  # API runs the compiled entrypoint directly (package.json "start" points at the
  # wrong path dist/main; real build output is dist/src/main.js).
  ( cd "$REPO/apps/api" && nohup node dist/src/main.js > "$LOGDIR/api-start.log" 2>&1 & echo "api launched pid $!" )
  wait_for_port_bound "$API_PORT" || { echo "!! API did not bind :$API_PORT"; exit 1; }
else
  log "No API/shared changes — leaving API running"
fi

# --- Web: always rebuild (frontend commits are the common case) + restart
log "Building web"
"$PNPM" --dir "$REPO" --filter @aljeel/web build

log "Restarting web (:$WEB_PORT)"
free_port "$WEB_PORT" 'next-server' || { echo "!! Web port :$WEB_PORT did not become free"; exit 1; }
nohup "$PNPM" --dir "$REPO" --filter @aljeel/web start --port "$WEB_PORT" --hostname 0.0.0.0 \
  > "$LOGDIR/web-start.log" 2>&1 &
echo "web launched pid $!"
wait_for_port_bound "$WEB_PORT" || { echo "!! Web did not bind :$WEB_PORT"; exit 1; }
sleep 3

# --- Verify: fail loudly if anything is wrong instead of silently shipping a broken site
log "Verifying"
FAIL=0
BUILD_ID=$(cat "$REPO/apps/web/.next/BUILD_ID")
API_LOCAL=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${API_PORT}/api/v1/health" || echo 000)
API_HTTPS=$(curl -s -o /dev/null -w '%{http_code}' "${PUBLIC_HOST}/api/v1/health" || echo 000)
WEB_LOCAL=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${WEB_PORT}/_next/static/${BUILD_ID}/_buildManifest.js" || echo 000)
WEB_HTTPS=$(curl -s -o /dev/null -w '%{http_code}' "${PUBLIC_HOST}/en/login" || echo 000)
echo "API local  :${API_PORT}/api/v1/health -> $API_LOCAL"
echo "API https  ${PUBLIC_HOST}/api/v1/health -> $API_HTTPS"
echo "Web local  :${WEB_PORT}/_next/static/${BUILD_ID}/_buildManifest.js -> $WEB_LOCAL"
echo "Web https  ${PUBLIC_HOST}/en/login     -> $WEB_HTTPS"
[ "$API_LOCAL" = "200" ] || { echo "!! API not healthy locally"; FAIL=1; }
[ "$API_HTTPS" = "200" ] || { echo "!! API not reachable over HTTPS (tunnel/mixed-content)"; FAIL=1; }
[ "$WEB_LOCAL" = "200" ] || { echo "!! Web is not serving the freshly built BUILD_ID locally"; FAIL=1; }
case "$WEB_HTTPS" in
  2*|3*) ;;
  *) echo "!! Web not serving over HTTPS"; FAIL=1 ;;
esac

if [ "$FAIL" = "0" ]; then
  log "DEPLOY OK  ($BEFORE -> $AFTER)"
else
  log "DEPLOY COMPLETED WITH ERRORS — check above"; exit 1
fi
