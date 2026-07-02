// ============================================================================
// views/runs-all.js — Runs (#/runs): the GLOBAL recent-runs view.
//
// There is no single "all runs" endpoint, so we fan out: GET /v2/batches, then
// GET /v2/batches/<b>/runs for each (in parallel, bounded to PER_BATCH each),
// merge, sort newest-first, and cap to MAX_ROWS. A chronological table across
// every batch — the "view previous runs" the CFO asked for.
//
// Run row shape (droplet_api_v2._history_row) — batch_id is attached by us:
//   { run_id, state, trigger, created_at, started_at, ended_at, duration_sec,
//     total_rows, flagged_rows, sar_at_risk, hard_count, has_report, has_split }
// ============================================================================

import {
  el, icon, stateChip, timeAgo, absTime, fmtMoney, fmtDuration, shortRun,
  navigate, errorState, isTerminal,
} from '../app.js';
import { listBatches, listRuns, downloadUrl } from '../api.js';

const PER_BATCH = 8;   // runs fetched per batch
const MAX_ROWS  = 50;  // global cap after merge

const STATUS_FILTERS = {
  all:        () => true,
  active:     (r) => !isTerminal(r.state),
  succeeded:  (r) => r.state === 'SUCCEEDED',
  failed:     (r) => r.state === 'FAILED' || r.state === 'CANCELLED',
};
const STATUS_DEFS = [
  { id: 'all',       label: 'All' },
  { id: 'active',    label: 'In progress' },
  { id: 'succeeded', label: 'Succeeded' },
  { id: 'failed',    label: 'Failed' },
];

const startedTs = (r) => Date.parse(r.started_at || r.created_at || '') || 0;

export async function mount(view) {
  const head = el('div', { class: 'page-head' }, [
    el('h1', { class: 'h2 page-head__title', text: 'Runs' }),
    el('p', { class: 'body-s muted page-head__caption',
      text: `Most recent reconciliation runs across all batches (latest ${MAX_ROWS}).` }),
  ]);
  const toolbar = el('div', { class: 'toolbar' });
  const body = el('div', {});
  view.replaceChildren(head, toolbar, body);

  body.replaceChildren(el('div', { class: 'dtable-wrap' },
    [el('div', { class: 'skeleton', style: 'height:320px;border-radius:0' })]));

  // ── Fan out: batches → their runs ──────────────────────────────────────────
  let batches;
  try {
    const data = await listBatches();
    batches = (data && data.batches) || [];
  } catch (err) {
    toolbar.replaceChildren();
    body.replaceChildren(errorState(err, { onRetry: () => mount(view) }));
    return;
  }

  const perBatch = await Promise.all(batches.map(async (b) => {
    try {
      const d = await listRuns(b.batch_id, PER_BATCH);
      return ((d && d.runs) || []).map((r) => ({ ...r, batch_id: b.batch_id }));
    } catch (_e) {
      return []; // one unreadable batch must not sink the whole view
    }
  }));

  const all = perBatch.flat().sort((a, b) => startedTs(b) - startedTs(a)).slice(0, MAX_ROWS);

  if (!all.length) {
    toolbar.replaceChildren();
    body.replaceChildren(el('div', { class: 'card notice' }, [
      icon('inbox', { size: 24 }),
      el('div', { class: 'h5', text: 'No runs yet' }),
      el('div', { class: 'body-s muted', text: 'Trigger a run from any batch to see it here.' }),
    ]));
    return;
  }

  // ── Status filter chips ────────────────────────────────────────────────────
  const state = { filter: 'all' };
  const chipEls = {};
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter runs by status' },
    STATUS_DEFS.map((f) => {
      const count = all.filter(STATUS_FILTERS[f.id]).length;
      const c = el('button', { class: 'chip', type: 'button' }, [
        el('span', { text: f.label }), el('span', { class: 'chip__count', text: String(count) }),
      ]);
      c.addEventListener('click', () => { state.filter = f.id; sync(); render(); });
      chipEls[f.id] = c;
      return c;
    }));
  function sync() { for (const [id, c] of Object.entries(chipEls)) c.classList.toggle('is-active', id === state.filter); }
  toolbar.replaceChildren(chips);
  sync();

  function render() {
    const rows = all.filter(STATUS_FILTERS[state.filter]);
    if (!rows.length) {
      body.replaceChildren(el('div', { class: 'card notice' }, [
        icon('search', { size: 24 }),
        el('div', { class: 'h5', text: 'No runs match this filter' }),
      ]));
      return;
    }
    const table = el('table', { class: 'dtable' }, [
      el('thead', {}, [el('tr', {}, [
        th('Batch'), th('Run'), th('Status'), th('Started'), th('Duration'),
        th('Flagged'), th('SAR at risk'), th(''),
      ])]),
      el('tbody', {}, rows.map(runRow)),
    ]);
    body.replaceChildren(el('div', { class: 'dtable-wrap' }, [table]));
  }

  render();
}

function th(label) { return el('th', { text: label }); }
function td(children, cls) { return el('td', cls ? { class: cls } : {}, children); }

function runRow(r) {
  const detailHash = `#/b/${encodeURIComponent(r.batch_id)}/r/${encodeURIComponent(r.run_id)}`;
  const startedIso = r.started_at || r.created_at;

  // Actions: open detail + (when succeeded with a split) a direct SPLIT download.
  const actions = el('div', { class: 'row gap-2', style: 'justify-content:flex-end' });
  if (r.state === 'SUCCEEDED' && r.has_split) {
    actions.append(el('a', {
      class: 'btn btn--secondary btn--sm', href: downloadUrl(r.run_id), download: '', rel: 'noopener',
      title: 'Download SPLIT spreadsheet',
      onclick: (e) => e.stopPropagation(),
    }, [icon('download'), 'SPLIT']));
  }
  actions.append(el('a', { class: 'btn btn--ghost btn--sm', href: detailHash,
    onclick: (e) => e.stopPropagation() }, [icon('chevron-right')]));

  const tr = el('tr', { class: 'is-link', tabindex: '0',
    onclick: () => navigate(detailHash),
    onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); navigate(detailHash); } },
  }, [
    td([el('span', { class: 'row gap-2' }, [icon('layers'), el('span', { text: r.batch_id })])]),
    td([el('span', { class: 'mono', text: shortRun(r.run_id) })]),
    td([stateChip(r.state)]),
    td([el('span', { title: absTime(startedIso), text: startedIso ? timeAgo(startedIso) : '—' })]),
    td([fmtDuration(r.duration_sec)], 'td--num'),
    td([r.flagged_rows != null ? String(r.flagged_rows) : '—'], 'td--num'),
    td([r.sar_at_risk != null ? fmtMoney(r.sar_at_risk) : '—'], 'td--num'),
    td([actions], 'td--actions'),
  ]);
  return tr;
}
