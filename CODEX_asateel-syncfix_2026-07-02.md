Implemented only in the repo copy: [kb-sync.sh](/home/clawdbot/.openclaw/workspace/aljeel/files-portal/droplet-sync/kb-sync.sh:67). I did not deploy, did not run the script, did not touch `/usr/local/bin`, and did not run `systemctl`.

Verification passed:

```bash
bash -n /home/clawdbot/.openclaw/workspace/aljeel/files-portal/droplet-sync/kb-sync.sh
```

Exact step 2 diff:

```diff
@@ -67,16 +67,37 @@ fi
 
 # 2. Sync removals: get list of objects in Spaces, find local files that aren't there → move to archive
 LOCAL_FILES=$(cd "$CURRENT" && find . -type f -printf '%P\n' 2>/dev/null | sort)
-REMOTE_FILES=$(sudo -u clawdbot rclone lsf --files-only -R "spaces:${BUCKET}/current/" 2>/dev/null | sort)
-
-removed=$(comm -23 <(echo "$LOCAL_FILES") <(echo "$REMOTE_FILES"))
-if [ -n "$removed" ]; then
-  while IFS= read -r f; do
-    [ -z "$f" ] && continue
-    dest="$ARCHIVE/$(date -u +%Y-%m-%d)/$f"
-    mkdir -p "$(dirname "$dest")"
-    mv "$CURRENT/$f" "$dest" 2>/dev/null && log "archived (removed remotely): $f"
-  done <<< "$removed"
+LOCAL_MAIN_FILES=$(printf '%s\n' "$LOCAL_FILES" | grep -v '^asateel/' || true)
+LOCAL_ASATEEL_FILES=$(printf '%s\n' "$LOCAL_FILES" | grep '^asateel/' || true)
+REMOTE_MAIN=$(sudo -u clawdbot rclone lsf --files-only -R "spaces:${BUCKET}/current/" 2>/dev/null)
+REMOTE_MAIN_STATUS=$?
+REMOTE_ASATEEL=""
+REMOTE_ASATEEL_STATUS=0
+
+if [ "$BUCKET" = "accord-aljeel-ap-kb" ]; then
+  REMOTE_ASATEEL=$(sudo -u clawdbot rclone lsf --files-only -R "spaces:${BUCKET}/asateel/current/" 2>/dev/null | sed 's#^#asateel/#')
+  REMOTE_ASATEEL_STATUS=$?
+fi
+
+if [ "$REMOTE_MAIN_STATUS" -ne 0 ]; then
+  log "warning: skipping removal sweep because remote listing failed: spaces:${BUCKET}/current/"
+elif [ -n "$LOCAL_MAIN_FILES" ] && [ -z "$REMOTE_MAIN" ]; then
+  log "warning: skipping removal sweep because remote listing is empty while local files exist: spaces:${BUCKET}/current/"
+elif [ "$REMOTE_ASATEEL_STATUS" -ne 0 ]; then
+  log "warning: skipping removal sweep because remote listing failed: spaces:${BUCKET}/asateel/current/"
+elif [ "$BUCKET" = "accord-aljeel-ap-kb" ] && [ -n "$LOCAL_ASATEEL_FILES" ] && [ -z "$REMOTE_ASATEEL" ]; then
+  log "warning: skipping removal sweep because remote listing is empty while local asateel files exist: spaces:${BUCKET}/asateel/current/"
+else
+  REMOTE_FILES=$(printf '%s\n%s\n' "$REMOTE_MAIN" "$REMOTE_ASATEEL" | sed '/^$/d' | sort)
+  removed=$(comm -23 <(echo "$LOCAL_FILES") <(echo "$REMOTE_FILES"))
+  if [ -n "$removed" ]; then
+    while IFS= read -r f; do
+      [ -z "$f" ] && continue
+      dest="$ARCHIVE/$(date -u +%Y-%m-%d)/$f"
+      mkdir -p "$(dirname "$dest")"
+      mv "$CURRENT/$f" "$dest" 2>/dev/null && log "archived (removed remotely): $f"
+    done <<< "$removed"
+  fi
 fi
```

The fix makes the remote comparison prefix-aware: `current/` is listed as before, and for `accord-aljeel-ap-kb` the separate `asateel/current/` listing is mapped to local paths by prepending `asateel/`. That means `LOCAL_FILES` and `REMOTE_FILES` now use the same path layout before `comm -23`.

The guard prevents mass-archive on bad listings: if an `rclone lsf` fails, or if a prefix listing is empty while matching local files exist, the whole removal sweep is skipped for that run with a warning. Steps 1/1b copy behavior, flocking, KV archive logic, hash/reindex logic, and `set -uo pipefail` are unchanged.
