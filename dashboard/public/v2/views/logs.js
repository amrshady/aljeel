// ============================================================================
// views/logs.js — the Logs tab body (mounted inside run-detail).
//
// Built as LogsView(runId, getState) → { node, load(), onShow(), onHide() },
// mirroring EvidenceView / ReportView: the node is created synchronously so
// run-detail can drop it into the Logs tab panel, and the actual log fetch is
// deferred to load(), which run-detail calls the FIRST time the Logs tab is
// opened (lazy — never fetched for a run nobody inspects).
//
// Logs is OPT-IN and NEVER the completion signal — completion stays the
// run-state poll (Phase 5). This view only tails the log for human review.
//
// Composes a small toolbar over the LogTail component:
//   • a live indicator (pulsing dot) shown only while actively tailing a run
//   • Auto-scroll toggle (on by default; auto-pauses when you scroll up)
//   • Jump to bottom (re-arms auto-scroll)
//   • Copy (copies the retained log text to the clipboard)
//   • a "trimmed" note when the bounded-DOM cap dropped earlier lines
// ============================================================================

import { el, icon, toast } from '../app.js';
import { LogTail } from '../components/log-tail.js';

export function LogsView(runId, getState) {
  const tail = LogTail(runId, getState);

  // ── Live indicator + trimmed note ──────────────────────────────────────────
  const liveDot = el('span', { class: 'logs__livedot', 'aria-hidden': 'true' });
  const liveLabel = el('span', { class: 'caption', text: 'Live' });
  const live = el('span', { class: 'logs__live', title: 'Tailing this run live' }, [liveDot, liveLabel]);
  const trimNote = el('span', { class: 'caption muted', text: '' });

  // ── Toolbar buttons ────────────────────────────────────────────────────────
  const autoBtn = el('button', { class: 'btn btn--secondary btn--sm', type: 'button', 'aria-pressed': 'true' },
    [icon('arrow-left'), 'Auto-scroll']);
  autoBtn.addEventListener('click', () => tail.setAutoScroll(!tail.isAutoScroll()));

  const bottomBtn = el('button', { class: 'btn btn--secondary btn--sm', type: 'button', title: 'Jump to bottom' },
    [icon('download'), 'Bottom']);
  bottomBtn.addEventListener('click', () => tail.jumpToBottom());

  const copyBtn = el('button', { class: 'btn btn--secondary btn--sm', type: 'button', title: 'Copy log to clipboard' },
    [icon('file-text'), 'Copy']);
  copyBtn.addEventListener('click', async () => {
    const body = tail.text();
    if (!body) { toast('Nothing to copy yet', 'warn'); return; }
    try {
      await navigator.clipboard.writeText(body);
      toast('Log copied to clipboard', 'ok');
    } catch (_e) {
      toast('Copy failed — clipboard unavailable', 'error');
    }
  });

  const toolbar = el('div', { class: 'logs__bar' }, [
    el('div', { class: 'row gap-2', style: 'align-items:center' }, [
      el('h2', { class: 'h5', text: 'Run log' }),
      live,
      trimNote,
    ]),
    el('div', { class: 'row gap-2', style: 'flex-wrap:wrap' }, [autoBtn, bottomBtn, copyBtn]),
  ]);

  const node = el('div', { class: 'logs stack gap-3' }, [toolbar, tail.node]);

  // ── Reflect LogTail state into the toolbar ──────────────────────────────────
  tail.subscribe((s) => {
    // Live dot only while actively tailing a non-terminal run.
    live.style.display = s.live ? '' : 'none';

    // Auto-scroll toggle visual state.
    const on = s.auto;
    autoBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    autoBtn.classList.toggle('is-active', on);
    autoBtn.replaceChildren(icon(on ? 'check-circle' : 'x-circle'), document.createTextNode('Auto-scroll'));

    trimNote.textContent = s.trimmed ? `showing latest ${s.lineCount} lines` : '';
  });

  return {
    node,
    load: () => tail.load(),
    onShow: () => tail.onShow(),
    onHide: () => tail.onHide(),
  };
}
