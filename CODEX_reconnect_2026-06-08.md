Implemented in [portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:824).

**Diff Summary**
- Added branded resume banner DOM and amber reconnect controls.
- Added `localStorage` persistence under `aljeel_portal_run_state` for `run_id`, `batch_id`, `currentLine`, `streamCompleted`, `terminalHtml`, and `startedAt`.
- Replaced one-shot reconnect with capped exponential backoff via `/api/current-run`.
- Preserved `connectStream(url, replayFromStart)` and `replaySkipRemaining = currentLine`.
- Restores terminal HTML and line offset before reconnecting from a saved session.
- Clears persisted state on new Run and on `[END]`.
- Added Cancel reconnect behavior and keeps Run disabled during active stream/reconnect.
- Light brand alignment for required colors/font fallback and warning banner tone.

Full unified diff is available at [aljeel_portal.diff](/tmp/aljeel_portal.diff) and is 601 lines.

Verification: extracted the page script and ran `node --check`; syntax passed. No backend files changed and `wrangler pages deploy` was not run.

[status: done rc=0]
