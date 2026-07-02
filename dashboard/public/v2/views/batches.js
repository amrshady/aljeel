// ============================================================================
// views/batches.js — Batches list (#/). The console landing page.
//
// GET /api/v2/batches → render ONE DENSE ROW per batch (not a sparse card grid).
// On top sit a toolbar (live search, status filter chips, sort dropdown) and a
// summary strip (totals), so the CFO can find a batch instead of eyeballing a
// wall of cards. Row click-through (→ #/b/<batch>) and the Run CTA are unchanged.
//
// Layout: a precise finance-ops list — white rows on 1px dividers, tabular
// numbers, status pill + relative time, and a compact "flagged · coverage"
// figure. Gold (#B8860B) is used ONLY as a deliberate milestone accent: a thin
// gold left-rule on hover and on the row whose last run is still active, plus a
// gold underline on the COVERAGE value (the GL-allocation milestone). Never as a
// fill or a button.
//
// The headline figure is GL allocation coverage (% of GL cells filled). SAR
// at-risk stays in the payload (and in the Runs / run-detail views) but no
// longer appears on this landing row — coverage is what the CFO opens to.
//
// Batch shape (droplet_api_v2._discover_batches):
//   { batch_id, evidence_root, item_count,
//     last_run: { run_id, state, ended_at, flagged_rows, sar_at_risk,
//                 coverage_pct, gl_cells_filled, gl_cells_blank, gl_cells_total } | null }
// coverage_pct may be null on older runs / pre-deploy backends → fall back to
// "— coverage". last_run has NO started_at/duration — sorts on ended_at.
// ============================================================================

import { el, icon, stateChip, timeAgo, absTime, navigate, errorState, isTerminal } from '../app.js';
import { listBatches } from '../api.js';
import { startRun } from '../run-trigger.js';

// Format a coverage percentage: integers stay clean ("90%"), fractions show one
// decimal ("87.5%"). Returns null for missing / non-finite values (older runs).
function fmtPct(v) {
  const n = Number(v);
  if (v == null || !Number.isFinite(n)) return null;
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
}

// Filter predicates keyed by chip id.
const FILTERS = {
  all:       () => true,
  has:       (b) => !!b.last_run,
  none:      (b) => !b.last_run,
  failed:    (b) => b.last_run && b.last_run.state === 'FAILED',
  succeeded: (b) => b.last_run && b.last_run.state === 'SUCCEEDED',
};
const FILTER_DEFS = [
  { id: 'all',       label: 'All' },
  { id: 'has',       label: 'Has runs' },
  { id: 'none',      label: 'No runs' },
  { id: 'failed',    label: 'Last run failed' },
  { id: 'succeeded', label: 'Last run succeeded' },
];

const SORTS = {
  batch:  (a, b) => String(b.batch_id).localeCompare(String(a.batch_id), undefined, { numeric: true }),
  items:  (a, b) => (b.item_count ?? 0) - (a.item_count ?? 0),
  recent: (a, b) => lastTs(b) - lastTs(a),
};
function lastTs(b) {
  const t = b.last_run && b.last_run.ended_at ? Date.parse(b.last_run.ended_at) : NaN;
  return Number.isNaN(t) ? -Infinity : t;
}

export async function mount(view) {
  const head = el('div', { class: 'page-head' }, [
    el('h1', { class: 'h2 page-head__title', text: 'Batches' }),
    el('p', { class: 'body-s muted page-head__caption',
      text: 'Jawal AP reconciliation — search, filter and open a batch to view its runs.' }),
  ]);

  const summary = el('div', { class: 'summary-strip' });
  const toolbar = el('div', { class: 'toolbar' });
  const list = el('div', { class: 'batchrows' });
  view.replaceChildren(head, summary, toolbar, list);

  // Skeleton while loading — dense rows, not tall cards.
  list.replaceChildren(...Array.from({ length: 7 }, () =>
    el('div', { class: 'skeleton', style: 'height:60px;border-radius:0' })));

  let data;
  try {
    data = await listBatches();
  } catch (err) {
    summary.replaceChildren();
    toolbar.replaceChildren();
    list.replaceChildren(errorState(err, { onRetry: () => mount(view) }));
    return;
  }

  const batches = (data && data.batches) || [];
  if (!batches.length) {
    summary.replaceChildren();
    toolbar.replaceChildren();
    list.replaceChildren(el('div', { class: 'notice' }, [
      icon('inbox', { size: 24 }),
      el('div', { class: 'h5', text: 'No batches found' }),
      el('div', { class: 'body-s muted', text: 'No Jawal evidence batches are currently available.' }),
    ]));
    return;
  }

  // ── Summary strip ──────────────────────────────────────────────────────────
  const withRuns = batches.filter((b) => b.last_run).length;
  const failed = batches.filter((b) => b.last_run && b.last_run.state === 'FAILED').length;
  summary.replaceChildren(
    stat(batches.length, 'batches'),
    stat(withRuns, 'with runs'),
    stat(failed, 'last run failed', failed > 0),
  );

  // ── Toolbar state ──────────────────────────────────────────────────────────
  const state = { q: '', filter: 'all', sort: 'batch' };

  const searchInput = el('input', { type: 'search', placeholder: 'Search batch id…', 'aria-label': 'Search batches' });
  searchInput.addEventListener('input', () => { state.q = searchInput.value.trim().toLowerCase(); apply(); });
  const searchBox = el('div', { class: 'toolbar__search' }, [icon('search'), searchInput]);

  const chipEls = {};
  const chips = el('div', { class: 'chips', role: 'group', 'aria-label': 'Filter batches' },
    FILTER_DEFS.map((f) => {
      const count = batches.filter(FILTERS[f.id]).length;
      const c = el('button', { class: 'chip', type: 'button' }, [
        el('span', { text: f.label }),
        el('span', { class: 'chip__count', text: String(count) }),
      ]);
      c.addEventListener('click', () => { state.filter = f.id; syncChips(); apply(); });
      chipEls[f.id] = c;
      return c;
    }));
  function syncChips() {
    for (const [id, c] of Object.entries(chipEls)) c.classList.toggle('is-active', id === state.filter);
  }

  const sortSel = el('select', { class: 'select', 'aria-label': 'Sort batches' }, [
    el('option', { value: 'batch',  text: 'Batch id' }),
    el('option', { value: 'items',  text: 'Item count' }),
    el('option', { value: 'recent', text: 'Last run time' }),
  ]);
  sortSel.addEventListener('change', () => { state.sort = sortSel.value; apply(); });

  toolbar.replaceChildren(
    searchBox,
    chips,
    el('span', { class: 'toolbar__spacer' }),
    el('label', { class: 'toolbar__sort' }, [el('span', { text: 'Sort' }), sortSel]),
  );
  syncChips();

  // ── Apply filter + sort + search → row list ────────────────────────────────
  function apply() {
    let rows = batches.filter(FILTERS[state.filter]);
    if (state.q) rows = rows.filter((b) => String(b.batch_id).toLowerCase().includes(state.q));
    rows = rows.slice().sort(SORTS[state.sort]);

    if (!rows.length) {
      list.replaceChildren(el('div', { class: 'notice' }, [
        icon('search', { size: 24 }),
        el('div', { class: 'h5', text: 'No matching batches' }),
        el('div', { class: 'body-s muted', text: 'Try a different search or clear the filter.' }),
      ]));
      return;
    }
    list.replaceChildren(headerRow(), ...rows.map(batchRow));
  }

  apply();
}

// Thin column-label header aligned to the row grid (same template columns).
function headerRow() {
  return el('div', { class: 'batchrow batchrow--head', 'aria-hidden': 'true' }, [
    el('span', { class: 'batchrow__id caption muted', text: 'Batch' }),
    el('span', { class: 'batchrow__items caption muted', text: 'Items' }),
    el('span', { class: 'batchrow__status caption muted', text: 'Last run' }),
    el('span', { class: 'batchrow__figure caption muted', text: 'Flagged · Coverage' }),
    el('span', { class: 'batchrow__actions caption muted', text: '' }),
  ]);
}

function stat(num, label, alert = false) {
  return el('div', { class: `summary-stat${alert ? ' summary-stat--alert' : ''}` }, [
    el('span', { class: 'summary-stat__num', text: String(num) }),
    el('span', { class: 'summary-stat__label', text: label }),
  ]);
}

function batchRow(b) {
  const hash = `#/b/${encodeURIComponent(b.batch_id)}`;
  const goto = () => navigate(hash);
  const last = b.last_run;
  // The row whose last run is still in flight is the live "milestone" — it earns
  // a persistent gold left-rule (the only always-on gold on this screen).
  const active = !!(last && last.state && !isTerminal(last.state));

  // (1) Batch id — H5 weight, navy, with the stacked-layers icon.
  const idCell = el('div', { class: 'batchrow__id' }, [
    icon('layers', { cls: 'batchrow__idicon' }),
    el('span', { class: 'batchrow__idtext', text: b.batch_id }),
  ]);

  // (2) Item count — muted, folder icon.
  const itemsCell = el('div', { class: 'batchrow__items', title: 'Evidence items' }, [
    icon('folder', { cls: 'batchrow__itemsicon' }),
    el('span', { class: 'mono', text: String(b.item_count ?? 0) }),
    el('span', { class: 'caption muted', text: 'items' }),
  ]);

  // (3) Last-run status pill + relative time.
  const statusCell = el('div', { class: 'batchrow__status' },
    last
      ? [
          stateChip(last.state),
          el('span', { class: 'caption muted', title: absTime(last.ended_at),
            text: last.ended_at ? timeAgo(last.ended_at) : '' }),
        ]
      : [el('span', { class: 'badge badge--muted' }, [icon('clock'), 'No runs']),
         el('span', { class: 'caption muted', text: 'never run' })]);

  // (4) Flagged · COVERAGE — GL-allocation completeness is the headline figure
  // (prominent ink, tabular) and the milestone → a thin gold underline. Flagged
  // count rides along as a smaller secondary stat; a caption beneath surfaces the
  // blank-cell count (warn-tinted when coverage is low). SAR at-risk is gone from
  // this row (still in the payload + the Runs / run-detail views). Gold used here
  // ONLY. Falls back to "— coverage" when coverage_pct is absent (older runs).
  const pct = last ? fmtPct(last.coverage_pct) : null;

  // Primary line: coverage figure (or em-dash fallback) + secondary flagged stat.
  const main = [];
  if (pct != null) {
    main.push(el('span', { class: 'batchrow__coverage', title: 'GL allocation coverage', text: pct }));
  } else {
    main.push(el('span', { class: 'batchrow__covnone', text: '—' }));
  }
  main.push(el('span', { class: 'caption muted', text: 'coverage' }));
  if (last && last.flagged_rows != null) {
    main.push(el('span', { class: 'batchrow__dot', text: '·' }));
    main.push(el('span', { class: 'batchrow__secondary', text: String(last.flagged_rows) }));
    main.push(el('span', { class: 'caption muted', text: 'flagged' }));
  }

  const figParts = [el('div', { class: 'batchrow__figmain' }, main)];

  // Caption line: blank-cell count. Tint the caption (not the figure) warn when
  // coverage is low (<80) to flag incomplete allocation; high coverage stays calm.
  if (pct != null && last.gl_cells_blank != null) {
    const low = Number(last.coverage_pct) < 80;
    const n = last.gl_cells_blank;
    figParts.push(el('span', {
      class: `batchrow__cap caption${low ? ' batchrow__cap--warn' : ''}`,
      text: `${n} blank cell${n === 1 ? '' : 's'}`,
    }));
  }

  const figureCell = el('div', { class: 'batchrow__figure' }, figParts);

  // (5) Actions — primary Run (unchanged startRun wiring) + ghost Open.
  const runBtn = el('button', { class: 'btn btn--primary btn--sm', type: 'button' },
    [icon('play'), 'Run']);
  runBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (runBtn.disabled) return;
    runBtn.disabled = true;
    runBtn.replaceChildren(icon('loader', { spin: true }), document.createTextNode('Starting…'));
    try {
      await startRun(b.batch_id, { trigger: 'manual' });
    } finally {
      // If startRun navigated away this node is gone; otherwise restore it.
      runBtn.disabled = false;
      runBtn.replaceChildren(icon('play'), document.createTextNode('Run'));
    }
  });
  const openBtn = el('a', { class: 'btn btn--ghost btn--sm', href: hash,
    title: 'Open batch runs', onclick: (e) => e.stopPropagation() }, [el('span', { text: 'Open' }), icon('chevron-right')]);
  const actionsCell = el('div', { class: 'batchrow__actions' }, [runBtn, openBtn]);

  return el('div', {
    class: `batchrow is-link${active ? ' batchrow--active' : ''}`,
    role: 'button', tabindex: '0',
    onclick: goto,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(); } },
  }, [idCell, itemsCell, statusCell, figureCell, actionsCell]);
}
