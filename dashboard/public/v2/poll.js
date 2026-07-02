// ============================================================================
// poll.js — the single shared, visibility-aware poller.
//
// This is Portal v2's completion mechanism (there is NO SSE). A view starts a
// poll for run-state; the poller calls the tick fn immediately, then on an
// interval, until the tick says "done" (terminal state) or the poll is stopped.
//
// Visibility-aware: when the tab is hidden the interval is suspended (no wasted
// requests / battery). On becoming visible again it fires an immediate catch-up
// tick and resumes. Only one PRIMARY Poll is active at a time per view; mounting
// a new view stops the previous poll.
//
// AUX polls ({aux:true}) run CONCURRENTLY with the primary poll instead of
// replacing it — this is what lets the Logs tab live-tail (Phase 8) without
// stopping run-detail's run-state completion poll. Aux polls are still torn down
// on navigation: stopActivePoll() (called by the router on every hashchange)
// stops the primary poll AND every aux poll, so nothing leaks across views.
// ============================================================================

let activePoll = null;
const auxPolls = new Set();

export class Poll {
  /**
   * @param {() => Promise<boolean|void>} tick  async fn; return true to stop
   *        (e.g. run reached a terminal state). Throwing is swallowed and retried.
   * @param {number} intervalMs  cadence while visible (default 2000ms).
   * @param {{aux?:boolean}} [opts]  aux:true runs concurrently with the primary
   *        poll (does not replace it); used by the Logs live tail.
   */
  constructor(tick, intervalMs = 2000, { aux = false } = {}) {
    this.tick = tick;
    this.intervalMs = intervalMs;
    this._aux = aux;
    this._timer = null;
    this._stopped = false;
    this._inFlight = false;
    this._onVisibility = this._onVisibility.bind(this);
  }

  start() {
    if (this._aux) {
      auxPolls.add(this);
    } else {
      // Enforce a single primary poller — replacing any prior one.
      if (activePoll && activePoll !== this) activePoll.stop();
      activePoll = this;
    }
    this._stopped = false;
    document.addEventListener('visibilitychange', this._onVisibility);
    this._run();
    return this;
  }

  stop() {
    this._stopped = true;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    document.removeEventListener('visibilitychange', this._onVisibility);
    if (this._aux) auxPolls.delete(this);
    else if (activePoll === this) activePoll = null;
  }

  // Run one tick, then schedule the next (unless stopped or hidden).
  async _run() {
    if (this._stopped || this._inFlight) return;
    // Don't poll a hidden tab; visibilitychange will resume us.
    if (document.hidden) return;

    this._inFlight = true;
    let done = false;
    try {
      done = await this.tick();
    } catch (_err) {
      // Transient failure — keep polling; the tick handles its own UI errors.
    } finally {
      this._inFlight = false;
    }
    if (this._stopped || done === true) { this.stop(); return; }
    this._timer = setTimeout(() => this._run(), this.intervalMs);
  }

  _onVisibility() {
    if (this._stopped) return;
    if (document.hidden) {
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    } else {
      // Immediate catch-up tick on return.
      if (this._timer) { clearTimeout(this._timer); this._timer = null; }
      this._run();
    }
  }
}

/** Convenience: build + start a poll in one call. */
export function poll(tick, intervalMs = 2000) {
  return new Poll(tick, intervalMs).start();
}

/** Stop the primary poll AND every aux poll (called on view unmount / nav). */
export function stopActivePoll() {
  if (activePoll) activePoll.stop();
  for (const p of [...auxPolls]) p.stop();
}
