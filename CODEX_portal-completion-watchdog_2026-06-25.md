Implemented frontend-only in [portal.html](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:918). No deploy performed.

Exact changed areas:
- [portal.html:918](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:918): added `COMPLETION_WATCHDOG_INTERVAL_MS = 9000`.
- [portal.html:939](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:939): added watchdog timer/in-flight state.
- [portal.html:975](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:975): `resetRunState()` now clears the watchdog.
- [portal.html:1021](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:1021): `clearRunState()` now clears the watchdog.
- [portal.html:1026](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:1026): added `clearCompletionWatchdog()` and `startCompletionWatchdog()`.
- [portal.html:1491](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:1491): `completeRun()` now clears the watchdog.
- [portal.html:1694](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:1694): resumed runs start the watchdog.
- [portal.html:1832](/home/clawdbot/.openclaw/workspace/aljeel/dashboard/public/portal.html:1832): new runs start the watchdog immediately after `connectStream(processUrl)`.

The watchdog polls independently of SSE every 9s and calls the existing `confirmRunOutputAndComplete(currentBatchId)`. That helper already falls back to `/api/last-run`, checks `/api/files/<batch>` for `FILLED-v30*.xlsx`, sets `pipelineSucceeded = true`, and calls `completeRun()`, so the existing success panel, full download, resolved download, and split download paths are preserved.

Validation: extracted both inline scripts from `portal.html` and parsed them with Node via `new Function(...)`; both passed. I did not edit Flask backend files, `_worker.js`, pipeline scripts, evidence/data/output files, or deploy anything.
