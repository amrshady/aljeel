// ============================================================================
// views/run-detail.js — Run detail (#/b/<batch>/r/<run>).
//
// THE COMPLETION-VIA-POLL MODEL (no SSE anywhere):
//   On mount we GET /api/v2/runs/<id> ONCE and render the correct screen
//   immediately. If the state is already terminal (SUCCEEDED/FAILED/CANCELLED)
//   we render "done" — with the SPLIT download wired straight from the store's
//   artifacts manifest — and DO NOT start polling. Otherwise we start the shared
//   visibility-aware poller (~2s) which re-reads run-state, drives the StateChip
//   + StageBar + RunTimeline, and stops the instant the state goes terminal.
//
//   Because every signal (state, stage, artifacts) comes from the persistent
//   store and never from a live stream, closing the tab and reopening hours
//   later still renders the correct terminal screen with the download intact.
//
// STALLED overlay: when the state payload reports stalled:true (server computes
// it from heartbeat gap + dead pid) we surface a prominent banner; the run is
// still RUNNING in the store until the reaper promotes it to FAILED.
//
// Tabs (Phase 8: FLIP collapsing-columns strip — the active tab expands, the
// siblings collapse, animated by a tiny measure→transform FLIP helper at 200ms;
// honors prefers-reduced-motion):
//   • Output     — fully built: SPLIT-only DownloadButton.
//   • Exceptions — fully built (Phase 7): "Risk & Inconsistencies" ReportView
//                  (KPIs + category bars + severity table + regenerate + .xlsx/.md
//                  downloads), lazy-loaded the first time the tab is opened.
//   • Evidence   — fully built (Phase 6): EvidenceTree + MsgReader, lazy-loaded
//                  the first time the tab is opened.
//   • Logs       — fully built (Phase 8): byte-offset paged LogTail + toolbar,
//                  lazy-loaded; live-tails a running run via an AUX poller that
//                  runs alongside (not instead of) this view's run-state poll.
// ============================================================================

import {
  el, icon, stateChip, navigate, shortRun, fmtDuration, isTerminal, errorState,
} from '../app.js';
import { getRun } from '../api.js';
import { poll } from '../poll.js';
import { flip, crossFade } from '../motion.js';
import { StageBar } from '../components/stage-bar.js';
import { RunTimeline } from '../components/timeline.js';
import { DownloadButton } from '../components/download-button.js';
import { EvidenceView } from './evidence.js';
import { ReportView } from './report.js';
import { LogsView } from './logs.js';

const TABS = [
  { id: 'output',     label: 'Output',     icon: 'download' },
  { id: 'exceptions', label: 'Risk & Inconsistencies', icon: 'alert-triangle' },
  { id: 'evidence',   label: 'Evidence',   icon: 'folder' },
  { id: 'logs',       label: 'Logs',       icon: 'terminal' },
];

export async function mount(view, { batchId, runId }) {
  // ── Scaffold ───────────────────────────────────────────────────────────────
  const chipHolder = el('span', {}, [stateChip(null)]);
  const durationEl = el('span', { class: 'caption muted', text: '' });

  const timeline = RunTimeline();
  const stagebar = StageBar();
  const stagebarWrap = el('div', { class: 'card', style: 'padding:16px;display:none' }, [stagebar.node]);

  const stalledBanner = el('div', { class: 'stalled-banner', style: 'display:none' }, [
    icon('alert-triangle', { size: 24 }),
    el('div', { class: 'stack gap-1' }, [
      el('div', { class: 'h5', text: 'This run appears stalled' }),
      el('div', { class: 'body-s', text: 'No heartbeat for over 2 minutes and the worker process is not alive. It may be auto-failed shortly.' }),
    ]),
  ]);

  const failNotice = el('div', { class: 'notice notice--error card', style: 'display:none;text-align:left' });

  const head = el('div', { class: 'view__head' }, [
    el('div', { class: 'stack gap-2' }, [
      el('div', { class: 'row gap-3', style: 'flex-wrap:wrap' }, [
        el('h1', { class: 'h2', text: `Run ${shortRun(runId)}` }),
        chipHolder,
      ]),
      el('div', { class: 'row gap-3', style: 'flex-wrap:wrap' }, [
        el('span', { class: 'caption muted mono', text: runId }),
        durationEl,
      ]),
    ]),
    el('button', { class: 'btn btn--secondary btn--sm', type: 'button',
      onclick: () => navigate(`#/b/${encodeURIComponent(batchId)}`) }, [icon('arrow-left'), 'Runs']),
  ]);

  // ── Tab strip + panels ───────────────────────────────────────────────────────
  const download = DownloadButton(runId);
  const outputPanel = el('div', { class: 'stack gap-3' }, [
    el('h3', { class: 'h5', text: 'Reconciliation output' }),
    el('p', { class: 'body-s muted', text: 'The split-by-employee spreadsheet — the only download Portal v2 serves.' }),
    download.node,
  ]);

  // Latest run object — kept fresh by applyState so the LogTail can ask whether
  // the run is terminal (it tails live only while running).
  let latestRun = null;

  const evidence = EvidenceView(runId);
  const report = ReportView(runId);
  const logs = LogsView(runId, () => latestRun);
  const panels = {
    output: outputPanel,
    exceptions: report.node,
    evidence: evidence.node,
    logs: logs.node,
  };

  let activeTab = null;
  const tabButtons = {};
  const strip = el('div', { class: 'tabs', role: 'tablist' }, TABS.map((t) => {
    const b = el('button', { class: 'tab', type: 'button', role: 'tab', 'data-tab': t.id,
      'aria-selected': 'false' }, [icon(t.icon), el('span', { class: 'tab__label', text: t.label })]);
    b.addEventListener('click', () => selectTab(t.id));
    tabButtons[t.id] = b;
    return b;
  }));
  const panelHost = el('div', { class: 'card tabpanel', style: 'padding:24px', role: 'tabpanel' });

  function setActiveClasses(id) {
    for (const [tid, btn] of Object.entries(tabButtons)) {
      const on = tid === id;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
  }

  function selectTab(id) {
    if (id === activeTab) return;
    const prev = activeTab;
    activeTab = id;

    // FLIP collapsing-columns: the active tab expands (pill + padding) and the
    // siblings collapse; measure→transform animates the slide at 200ms. The
    // class swap inside flip() is the layout mutation it animates around. The
    // very first selection (prev === null, on mount) is applied without motion.
    if (prev === null) setActiveClasses(id);
    else flip(Object.values(tabButtons), () => setActiveClasses(id));

    panelHost.replaceChildren(panels[id]);
    if (id === 'evidence') evidence.load();     // idempotent; fetches tree on first open only
    if (id === 'exceptions') report.load();     // idempotent; fetches report json on first open only
    if (id === 'logs') { logs.load(); logs.onShow(); } // lazy first load + resume live tail
    if (prev === 'logs' && id !== 'logs') logs.onHide(); // pause live tail when leaving Logs
  }

  view.replaceChildren(
    head,
    stalledBanner,
    failNotice,
    el('div', { class: 'stack gap-4', style: 'margin-bottom:24px' }, [
      el('div', { class: 'card', style: 'padding:16px' }, [timeline.node]),
      stagebarWrap,
    ]),
    strip,
    panelHost,
  );
  selectTab('output');

  // ── State application (idempotent; the poller calls it each tick) ─────────────
  function applyState(run) {
    // Cross-fade the StateChip only when the state (or stalled overlay) actually
    // changes — re-rendering the same chip every 2s tick would just flicker.
    const prev = latestRun;
    const changed = !prev || prev.state !== run.state || prev.stalled !== run.stalled;
    if (changed) crossFade(chipHolder, stateChip(run.state, run.stalled));
    latestRun = run;

    durationEl.textContent = run.duration_sec != null ? `Duration ${fmtDuration(run.duration_sec)}` : '';
    timeline.update(run);
    stagebar.update(run);

    // Stage bar is meaningful while there's a pipeline in motion; hide once
    // terminal-failed/cancelled (no progress to show) but keep on SUCCEEDED full.
    const showStage = !isTerminal(run.state) || run.state === 'SUCCEEDED';
    stagebarWrap.style.display = showStage && (run.stage || run.stage_index) ? '' : 'none';

    stalledBanner.style.display = run.stalled ? '' : 'none';

    if (run.state === 'FAILED' || run.state === 'CANCELLED') {
      failNotice.style.display = '';
      failNotice.replaceChildren(
        el('div', { class: 'h5', text: run.state === 'FAILED' ? 'Run failed' : 'Run cancelled' }),
        el('div', { class: 'body-s', text: run.failure_reason || (run.state === 'CANCELLED' ? 'Cancelled by operator; run directory discarded.' : 'No failure reason recorded.') }),
      );
    } else {
      failNotice.style.display = 'none';
    }

    const split = run.artifacts && run.artifacts.split;
    download.update(split, split ? (run.ended_at || run.heartbeat_at) : null);
  }

  // ── Load once, then poll only if not already terminal ─────────────────────────
  let first;
  try {
    first = await getRun(runId);
  } catch (err) {
    const card = errorState(err, { onRetry: () => mount(view, { batchId, runId }) });
    card.querySelector('.row').append(
      el('button', { class: 'btn btn--secondary btn--sm', type: 'button',
        onclick: () => navigate(`#/b/${encodeURIComponent(batchId)}`) }, ['Back to runs']));
    view.replaceChildren(card);
    return;
  }

  applyState(first);
  if (isTerminal(first.state)) return; // done — store is the source of truth, no stream needed

  // Live: poll the store until the state goes terminal.
  poll(async () => {
    const run = await getRun(runId);
    applyState(run);
    return isTerminal(run.state);
  });
}
