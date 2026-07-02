// ============================================================================
// components/log-tail.js — LogTail: the byte-offset paged run-log tail.
//
// This is the ONLY place in Portal v2 where raw log text appears (and the only
// place any token/cost detail could ever surface — behind the opt-in Logs tab,
// never the main UI). It consumes the REAL droplet endpoint:
//
//   GET /api/v2/runs/<id>/log?offset=<bytes>
//   → { run_id, offset, next_offset, eof, lines:[{ts, text}] }
//
// SHAPE SKEW vs spec C.8: the live backend (droplet_api_v2.py) emits each line
// as {"ts": null, "text": "<raw line>"} — `ts` is ALWAYS null (it splitlines a
// byte chunk; it does not parse per-line timestamps). So we render text-only,
// but still honor a `ts` defensively if a future backend ever fills it.
//
// PAGING / LIVENESS (no SSE — this is plain offset paging):
//   • load() drains from offset 0 forward to eof (looping past the server's
//     256 KiB-per-response cap), appending each page.
//   • For a RUNNING run we then start a SHARED visibility-aware AUX poller
//     (poll.js, aux:true — runs concurrently with run-detail's run-state poll
//     instead of replacing it) that fetches new bytes from next_offset every
//     ~2.5s and appends. It STOPS only when the run is terminal AND eof:true.
//   • For a TERMINAL run we page to eof once and start no poll.
//   • onHide() pauses the live tail (tab switched away / nav); onShow() resumes
//     from the retained next_offset, so no bytes are missed and none refetched.
//
// BOUNDED DOM: we cap retained lines (MAX_LINES) and drop the oldest in chunks —
// killing the v1 unbounded-terminal memory bug. A "trimmed" flag is surfaced so
// the toolbar can note that earlier lines were dropped.
//
// AUTO-SCROLL: on by default; pauses automatically when the user scrolls up,
// re-arms when they scroll back to the bottom. jumpToBottom() force-re-arms.
//
// SAFETY: every line is written via textContent (el's `text:`) — never
// innerHTML — so hostile log content can never inject markup/script.
//
// LogTail(runId, getState) → { node, load, onShow, onHide, setAutoScroll,
//   isAutoScroll, jumpToBottom, text, subscribe }
//   getState() returns the latest run object (for terminal detection).
// ============================================================================

import { el, icon, isTerminal } from '../app.js';
import { runLog } from '../api.js';
import { Poll } from '../poll.js';

const MAX_LINES = 4000;       // bounded DOM: hard cap on retained line nodes
const TRIM_TO = 3500;         // when over cap, trim back down to this many
const LIVE_INTERVAL = 2500;   // live-tail cadence (ms) while running
const DRAIN_GUARD = 4000;     // max pages per drain (runaway backstop)
const BOTTOM_SLOP = 48;       // px from bottom still counted as "at bottom"

export function LogTail(runId, getState) {
  const linesHost = el('div', { class: 'logtail__lines', role: 'log', 'aria-live': 'off', 'aria-label': 'Run log' });
  const viewport = el('div', { class: 'logtail__viewport', tabindex: '0' }, [linesHost]);
  const node = el('div', { class: 'logtail' }, [viewport]);

  let nextOffset = 0;
  let loaded = false;
  let draining = false;
  let autoScroll = true;
  let trimmed = false;
  let livePoll = null;
  const rawLines = [];           // retained raw strings (for copy)
  const subscribers = new Set();

  // ── Subscriber notification (toolbar listens for state changes) ─────────────
  function snapshot() {
    return {
      auto: autoScroll,
      live: !!livePoll,
      trimmed,
      lineCount: rawLines.length,
      terminal: isTerm(),
    };
  }
  function notify() { for (const cb of subscribers) { try { cb(snapshot()); } catch (_e) { /* noop */ } } }
  function subscribe(cb) { subscribers.add(cb); cb(snapshot()); return () => subscribers.delete(cb); }

  function isTerm() {
    const st = getState && getState();
    return !!(st && isTerminal(st.state));
  }

  // ── Rendering ────────────────────────────────────────────────────────────────
  function lineNode(line) {
    const ts = line && line.ts;
    const text = line && typeof line.text === 'string' ? line.text : String(line && line.text != null ? line.text : '');
    const row = el('div', { class: 'logtail__line' });
    if (ts) row.append(el('span', { class: 'logtail__ts mono', text: String(ts) }));
    // textContent path — never innerHTML.
    row.append(el('span', { class: 'logtail__text', text }));
    return row;
  }

  function atBottom() {
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= BOTTOM_SLOP;
  }
  function scrollToBottom() { viewport.scrollTop = viewport.scrollHeight; }

  function appendPage(lines) {
    if (!Array.isArray(lines) || !lines.length) return;
    const frag = document.createDocumentFragment();
    for (const line of lines) {
      const text = line && typeof line.text === 'string' ? line.text : '';
      rawLines.push(text);
      frag.append(lineNode(line));
    }
    linesHost.append(frag);

    // Bounded DOM: trim oldest nodes + raw strings when over the cap.
    if (rawLines.length > MAX_LINES) {
      const drop = rawLines.length - TRIM_TO;
      rawLines.splice(0, drop);
      for (let i = 0; i < drop && linesHost.firstChild; i++) linesHost.removeChild(linesHost.firstChild);
      if (!trimmed) { trimmed = true; notify(); }  // surface the "showing latest N" note once
    }
    if (autoScroll) scrollToBottom();
  }

  // ── Fetch / drain ────────────────────────────────────────────────────────────
  async function drainToEof() {
    if (draining) return;
    draining = true;
    try {
      let guard = 0;
      // First page replaces any skeleton; subsequent pages append.
      while (guard++ < DRAIN_GUARD) {
        const data = await runLog(runId, nextOffset);
        if (guard === 1) clearStatus();
        appendPage(data.lines);
        nextOffset = data.next_offset != null ? data.next_offset : nextOffset;
        if (data.eof) break;
      }
    } finally {
      draining = false;
    }
  }

  // ── Live tail (aux poll; runs alongside run-detail's run-state poll) ──────────
  function startLive() {
    if (livePoll) return;
    livePoll = new Poll(async () => {
      const data = await runLog(runId, nextOffset);
      appendPage(data.lines);
      nextOffset = data.next_offset != null ? data.next_offset : nextOffset;
      // Stop the live tail only once the run is terminal AND we've caught up.
      return isTerm() && data.eof === true;
    }, LIVE_INTERVAL, { aux: true });
    livePoll.start();
    notify();
  }
  function stopLive() {
    if (livePoll) { livePoll.stop(); livePoll = null; notify(); }
  }
  function maybeStartLive() {
    if (isTerm()) { stopLive(); return; }  // terminal: page-once, no ongoing poll
    startLive();
  }

  // ── Status (skeleton / empty) ────────────────────────────────────────────────
  let statusNode = null;
  function setStatus(n) { clearStatus(); statusNode = n; node.append(n); }
  function clearStatus() { if (statusNode) { statusNode.remove(); statusNode = null; } }
  function showSkeleton() {
    setStatus(el('div', { class: 'logtail__status stack gap-2', style: 'padding:16px' },
      Array.from({ length: 6 }, (_v, i) =>
        el('div', { class: 'skeleton', style: `height:14px;width:${[92, 74, 85, 60, 80, 68][i]}%` }))));
  }
  function showEmpty() {
    setStatus(el('div', { class: 'notice' }, [
      icon('terminal', { size: 24 }),
      el('div', { class: 'h5', text: 'No log output yet' }),
      el('div', { class: 'body-s muted', text: 'This run has not written any log lines.' }),
    ]));
  }
  function showError(err) {
    setStatus(el('div', { class: 'notice notice--error' }, [
      icon('alert-triangle', { size: 24 }),
      el('div', { class: 'h5', text: 'Could not load log' }),
      el('div', { class: 'body-s muted', text: `${(err && err.code) || 'error'}: ${(err && err.message) || ''}` }),
    ]));
  }

  // ── Public lifecycle ─────────────────────────────────────────────────────────
  async function load() {
    if (loaded) return;
    loaded = true;
    showSkeleton();
    try {
      await drainToEof();
    } catch (err) {
      loaded = false;            // allow a retry on the next open
      showError(err);
      return;
    }
    if (!rawLines.length) showEmpty();
    maybeStartLive();
    notify();
  }

  function onShow() {
    if (!loaded) { load(); return; }
    // Re-entered the tab: resume live tailing if the run is still going.
    maybeStartLive();
  }

  function onHide() {
    stopLive();                  // pause the live tail; next_offset is retained
  }

  // ── Auto-scroll control ──────────────────────────────────────────────────────
  function setAutoScroll(on) {
    autoScroll = !!on;
    if (autoScroll) scrollToBottom();
    notify();
  }
  function isAutoScroll() { return autoScroll; }
  function jumpToBottom() { autoScroll = true; scrollToBottom(); notify(); }

  // User scrolling up pauses auto-scroll; scrolling back to the bottom re-arms it.
  viewport.addEventListener('scroll', () => {
    const next = atBottom();
    if (next !== autoScroll) { autoScroll = next; notify(); }
  }, { passive: true });

  function text() { return rawLines.join('\n'); }

  return { node, load, onShow, onHide, setAutoScroll, isAutoScroll, jumpToBottom, text, subscribe };
}
