// ============================================================================
// components/timeline.js — RunTimeline.
//
// Three ticks — Created → Started → Ended — each showing a relative time with
// the absolute timestamp on hover (title). The Ended tick reflects the run's
// terminal state (succeeded/failed/cancelled) and stays empty while active.
//
// Returns { node, update(run) } so the poller can refresh the same node.
// ============================================================================

import { el, timeAgo, absTime } from '../app.js';

function tick(label) {
  const dot = el('span', { class: 'timeline__dot' });
  const time = el('span', { class: 'caption muted timeline__time', text: '—' });
  const node = el('div', { class: 'timeline__tick' }, [
    el('div', { class: 'row gap-2', style: 'align-items:center' }, [dot, el('span', { class: 'caption', text: label })]),
    time,
  ]);
  return { node, dot, time };
}

export function RunTimeline() {
  const created = tick('Created');
  const started = tick('Started');
  const ended = tick('Ended');
  const node = el('div', { class: 'timeline' }, [created.node, started.node, ended.node]);

  function setTime(t, iso) {
    if (iso) { t.time.textContent = timeAgo(iso); t.time.title = absTime(iso); }
    else { t.time.textContent = '—'; t.time.removeAttribute('title'); }
  }

  function update(run = {}) {
    setTime(created, run.created_at);
    setTime(started, run.started_at);
    setTime(ended, run.ended_at);

    created.dot.classList.toggle('is-on', !!run.created_at);
    started.dot.classList.toggle('is-on', !!run.started_at);

    // Ended dot carries the terminal outcome color.
    ended.dot.classList.remove('is-on', 'is-ok', 'is-err', 'is-muted');
    if (run.ended_at) {
      if (run.state === 'SUCCEEDED') ended.dot.classList.add('is-ok');
      else if (run.state === 'FAILED') ended.dot.classList.add('is-err');
      else ended.dot.classList.add('is-muted');
    }
  }

  return { node, update };
}
