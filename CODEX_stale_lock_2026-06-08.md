Implemented the stale lock fix across the three requested files.

**Diff Summary**
- [scripts/droplet_api_flask.py](/home/clawdbot/.openclaw/workspace/aljeel/scripts/droplet_api_flask.py:81)
  - Added shared lock cleanup helpers.
  - Added `_maybe_clear_stale_lock()` using lock age > 10 minutes plus inactive/missing log activity.
  - `/current-run` now auto-clears stale locks and returns `locked=false`.
  - Added `POST /clear-lock` with the `<30s` active-log safety check.
  - `/process` now calls `_maybe_clear_stale_lock()` before `os.open(... O_EXCL ...)`.
  - `_release_run_lock()` now reuses the shared cleanup helper.

- [dashboard/public/_worker.js](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/_worker.js:219)
  - Added `POST /api/clear-lock` proxy to Flask `/clear-lock`.

- [dashboard/public/portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:368)
  - Added hidden “Clear Stale Lock” panel below the terminal.
  - Detects `[API] ERROR: A pipeline run is already in progress`.
  - Posts to `/api/clear-lock`.
  - Shows success or active-pipeline failure message.
  - Prevents the lock-error `[END]` event from being treated as a successful pipeline completion.
  - Added brand-compliant danger button styling and corrected secondary button text color.

**Checks**
- `node --check dashboard/public/_worker.js` passed.
- Portal inline script syntax check passed.
- `python3 -m py_compile scripts/droplet_api_flask.py` passed.

I did not run `wrangler pages deploy`.

[status: done rc=0]
