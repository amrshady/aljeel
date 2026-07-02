// ============================================================================
// components/stage-bar.js — StageBar.
//
// Renders an eased progress bar driven purely by the run-state payload's
// `stage_index` / `stage_total` (set per stage by run_worker_v2), plus a
// friendly label for the current `stage`. Width transitions via the brand
// motion token; respects prefers-reduced-motion through tokens.css.
//
// Returns { node, update(state) } so the run-detail poller can drive the same
// DOM node without re-creating it (smooth width easing across ticks).
// ============================================================================

import { el } from '../app.js';

// Worker stage keys → human labels (run_worker_v2.STAGES + invoice pre-stage).
// Clutter sweep (Phase 8): labels describe WHAT each stage does, never which
// model/tech runs it — no "LLM"/"AI"/model names leak into the main UI.
const STAGE_LABELS = {
  preflight: 'Preflight',
  'invoice-convert': 'Converting invoice',
  cascade: 'Deterministic cascade',
  'v30-llm': 'Exception handler',
  'document-parser': 'Document parser',
  fraud: 'Consistency check',
  inject: 'Injecting results',
  review: 'Rebuilding review',
  split: 'Splitting multi-employee rows',
  finalize: 'Finalizing',
};

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

export function StageBar() {
  const fill = el('div', { class: 'stagebar__fill' });
  const label = el('span', { class: 'caption muted stagebar__label', text: 'Waiting…' });
  const count = el('span', { class: 'caption muted', text: '' });
  const node = el('div', { class: 'stagebar' }, [
    el('div', { class: 'stagebar__track', role: 'progressbar' }, [fill]),
    el('div', { class: 'row stagebar__meta', style: 'justify-content:space-between' }, [label, count]),
  ]);

  function update({ stage, stage_index, stage_total, state } = {}) {
    const total = Number(stage_total) || 0;
    const idx = Number(stage_index) || 0;
    // On a terminal SUCCEEDED, peg to full regardless of last reported index.
    const ratio = state === 'SUCCEEDED' ? 1 : (total ? clamp01(idx / total) : 0);
    const pct = Math.round(ratio * 100);
    fill.style.width = `${pct}%`;
    fill.classList.toggle('stagebar__fill--done', state === 'SUCCEEDED');
    fill.classList.toggle('stagebar__fill--fail', state === 'FAILED' || state === 'CANCELLED');
    node.querySelector('.stagebar__track').setAttribute('aria-valuenow', String(pct));
    label.textContent = STAGE_LABELS[stage] || (stage ? stage : 'Waiting…');
    count.textContent = total ? `Step ${Math.min(idx, total)} of ${total}` : '';
  }

  return { node, update };
}
