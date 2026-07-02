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
  sleep 2
  # API runs the compiled entrypoint directly (package.json "start" points at the
  # wrong path dist/main; real build output is dist/src/main.js).
  ( cd "$REPO/apps/api" && nohup node dist/src/main.js > "$LOGDIR/api-start.log" 2>&1 & echo "api launched pid $!" )
else
  log "No API/shared changes — leaving API running"
fi

# --- Web: always rebuild (frontend commits are the common case) + restart
log "Building web"
"$PNPM" --dir "$REPO" --filter @aljeel/web build

log "Restarting web (:$WEB_PORT)"
pkill -f '@aljeel/web start' 2>/dev/null || true
pkill -f 'next start' 2>/dev/null || true
sleep 3
nohup "$PNPM" --dir "$REPO" --filter @aljeel/web start --port "$WEB_PORT" --hostname 0.0.0.0 \
  > "$LOGDIR/web-start.log" 2>&1 &
echo "web launched pid $!"
sleep 8

# --- Verify: fail loudly if anything is wrong instead of silently shipping a broken site
log "Verifying"
FAIL=0
API_LOCAL=$(curl -s -o /dev/null -w '%{http_code}' "http://localhost:${API_PORT}/api/v1/health" || echo 000)
API_HTTPS=$(curl -s -o /dev/null -w '%{http_code}' "${PUBLIC_HOST}/api/v1/health" || echo 000)
WEB_HTTPS=$(curl -s -o /dev/null -w '%{http_code}' "${PUBLIC_HOST}/en/login" || echo 000)
echo "API local  :${API_PORT}/api/v1/health -> $API_LOCAL"
echo "API https  ${PUBLIC_HOST}/api/v1/health -> $API_HTTPS"
echo "Web https  ${PUBLIC_HOST}/en/login     -> $WEB_HTTPS"
[ "$API_LOCAL" = "200" ] || { echo "!! API not healthy locally"; FAIL=1; }
[ "$API_HTTPS" = "200" ] || { echo "!! API not reachable over HTTPS (tunnel/mixed-content)"; FAIL=1; }
[ "$WEB_HTTPS" = "200" ] || { echo "!! Web not serving over HTTPS"; FAIL=1; }

if [ "$FAIL" = "0" ]; then
  log "DEPLOY OK  ($BEFORE -> $AFTER)"
else
  log "DEPLOY COMPLETED WITH ERRORS — check above"; exit 1
fi
