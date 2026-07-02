// ============================================================================
// run-trigger.js — shared "start a run" action used by the Batches "Run" CTA
// and the Runs-history "Re-run" CTA.
//
// POST /api/v2/batches/<batch>/runs and handle the two documented outcomes:
//   • 202 {run_id, state:'QUEUED'}      → navigate to the new run's detail
//   • 409 {error:'run_in_progress',     → toast "a run is already in progress"
//          active_run_id}                 with a link to the active run
// Any other failure surfaces an error toast. Callers own the button's busy
// state; this helper resolves to the run_id on success or null otherwise.
// ============================================================================

import { ApiError, navigate, toast } from './app.js';
import { triggerRun } from './api.js';

/**
 * @param {string} batchId
 * @param {{trigger?: 'manual'|'rerun', no_cache?: boolean}} opts
 * @returns {Promise<string|null>} the new run_id (202) or null (409/error)
 */
export async function startRun(batchId, { trigger = 'manual', no_cache = false } = {}) {
  const runHash = (rid) => `#/b/${encodeURIComponent(batchId)}/r/${encodeURIComponent(rid)}`;
  try {
    const res = await triggerRun(batchId, { trigger, no_cache });
    if (res && res.run_id) {
      navigate(runHash(res.run_id));
      return res.run_id;
    }
    toast('Run could not be started — no run id returned.', 'error');
    return null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) {
      const activeId = err.body && err.body.active_run_id;
      toast('A run is already in progress.', 'warn',
        activeId ? { label: 'View active run', onClick: () => navigate(runHash(activeId)) } : null);
      return null;
    }
    const detail = err instanceof ApiError ? err.message : 'network error';
    toast(`Could not start run: ${detail}`, 'error');
    return null;
  }
}
