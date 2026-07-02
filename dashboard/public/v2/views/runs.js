// ============================================================================
// views/runs.js — Runs history (#/b/<batch>).
//
// GET /api/v2/batches/<batch>/runs → newest-first list of runs. Each row shows:
//   • state chip (+ trigger badge)        • short run id
//   • started (relative + absolute)       • rows / flagged / SAR-at-risk
//   • duration
// Clicking a row opens its run detail (#/b/<batch>/r/<run>). The header [Re-run]
// CTA POSTs a rerun (202 → navigate to the new run, 409 → toast + active link).
// Breadcrumb (Batches / <batch>) is rendered by app.js's router.
// ============================================================================

import { el, icon, stateChip, timeAgo, absTime, fmtMoney, fmtDuration, shortRun, navigate, errorState } from '../app.js';
import { listRuns } from '../api.js';
import { startRun } from '../run-trigger.js';

export async function mount(view, { batchId }) {
  const rerunBtn = el('button', { class: 'btn btn--primary btn--sm', type: 'button' },
    [icon('refresh-cw'), 'Re-run']);
  rerunBtn.addEventListener('click', async () => {
    if (rerunBtn.disabled) return;
    rerunBtn.disabled = true;
    rerunBtn.replaceChildren(icon('loader', { spin: true }), document.createTextNode('Starting…'));
    try {
      await startRun(batchId, { trigger: 'rerun' });
    } finally {
      rerunBtn.disabled = false;
      rerunBtn.replaceChildren(icon('refresh-cw'), document.createTextNode('Re-run'));
    }
  });

  const head = el('div', { class: 'view__head' }, [
    el('div', { class: 'stack gap-1' }, [
      el('h1', { class: 'h2', text: `${batchId}` }),
      el('p', { class: 'body-s muted', text: 'Run history — newest first.' }),
    ]),
    el('div', { class: 'row gap-2' }, [
      el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => navigate('#/') },
        [icon('arrow-left'), 'Batches']),
      rerunBtn,
    ]),
  ]);

  const list = el('div', { class: 'stack gap-3' });
  view.replaceChildren(head, list);

  list.replaceChildren(...Array.from({ length: 4 }, () =>
    el('div', { class: 'skeleton', style: 'height:72px' })));

  let data;
  try {
    data = await listRuns(batchId);
  } catch (err) {
    list.replaceChildren(errorState(err, { onRetry: () => mount(view, { batchId }) }));
    return;
  }

  const runs = (data && data.runs) || [];
  if (!runs.length) {
    list.replaceChildren(el('div', { class: 'card notice' }, [
      icon('inbox', { size: 24 }),
      el('div', { class: 'h5', text: 'No runs yet' }),
      el('div', { class: 'body-s muted', text: 'Trigger the first run for this batch with Re-run above.' }),
    ]));
    return;
  }

  list.replaceChildren(...runs.map((r) => runRow(batchId, r)));
}

function metric(label, value) {
  return el('div', { class: 'stack', style: 'min-width:84px' }, [
    el('div', { class: 'body-s', text: value }),
    el('div', { class: 'caption muted', text: label }),
  ]);
}

function runRow(batchId, r) {
  const goto = () => navigate(`#/b/${encodeURIComponent(batchId)}/r/${encodeURIComponent(r.run_id)}`);
  const startedIso = r.started_at || r.created_at;

  const left = el('div', { class: 'stack gap-2', style: 'min-width:200px' }, [
    el('div', { class: 'row gap-2', style: 'flex-wrap:wrap' }, [
      stateChip(r.state),
      r.trigger === 'rerun' ? el('span', { class: 'badge badge--muted' }, [icon('refresh-cw'), 'Re-run']) : null,
    ]),
    el('div', { class: 'row gap-2' }, [
      el('span', { class: 'body-s mono', text: shortRun(r.run_id) }),
      el('span', { class: 'caption muted', title: absTime(startedIso), text: startedIso ? timeAgo(startedIso) : '—' }),
    ]),
  ]);

  const metrics = el('div', { class: 'row gap-4 runrow__metrics', style: 'flex-wrap:wrap' }, [
    metric('rows', r.total_rows != null ? String(r.total_rows) : '—'),
    metric('flagged', r.flagged_rows != null ? String(r.flagged_rows) : '—'),
    metric('SAR at risk', r.sar_at_risk != null ? fmtMoney(r.sar_at_risk) : '—'),
    metric('duration', fmtDuration(r.duration_sec)),
  ]);

  return el('div', {
    class: 'card runrow',
    role: 'button', tabindex: '0',
    onclick: goto,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(); } },
  }, [
    left,
    metrics,
    el('span', { class: 'runrow__chevron' }, [icon('chevron-right')]),
  ]);
}
