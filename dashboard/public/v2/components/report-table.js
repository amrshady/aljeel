// ============================================================================
// components/report-table.js — ReportTable (Risk & Inconsistencies report).
//
// Renders the per-run risk report payload returned by
//   GET /api/v2/runs/<id>/report?format=json
// into three stacked sections:
//
//   1. Headline KPI cards  — flagged_rows, SAR-at-risk (money), hard_count,
//      fraud_catches. (NB: the REAL payload nests these under `kpis`, NOT the
//      spec's `headline`; the view reads `payload.kpis`.)
//   2. Category breakdown  — the `categories` map as labeled proportional bars,
//      plus a compact `severity_counts` badge strip.
//   3. Exceptions table    — the severity-sorted `rows[]` (server already orders
//      HARD→HIGH→MEDIUM→INFO) as a real HTML table with brand styling.
//
// REAL row shape (confirmed vs live backend — differs from spec C.6):
//   spec said   : {sl_nos, severity, category, employee_no, amount, detail}
//   actual keys : *Amount, Account, Description, Employee No, QC Catches,
//                 Row Status, Sl. #, account, all_sl_nos, category, detail,
//                 emp_no, passenger, related_ticket, route, severity,
//                 severity_bucket, source, ticket_no, tier, value_at_risk_sar
//   mapping     : sl_nos→all_sl_nos (fallback "Sl. #"); employee_no→"Employee No"
//                 (fallback emp_no); amount→*Amount (fallback value_at_risk_sar);
//                 severity badge colored by severity_bucket.
//
// SAFETY: every dynamic string lands via el()'s text:/textContent — never
// innerHTML. (icon() injects only static, trusted SVG path data.)
// ============================================================================

import { el, fmtMoney } from '../app.js';

// severity_bucket → brand status-badge variant (tokens.css .badge--*).
//   HARD→err, HIGH→alert, MEDIUM→warn, INFO→info; anything else → muted.
const SEV_VARIANT = { HARD: 'err', HIGH: 'alert', MEDIUM: 'warn', INFO: 'info' };
function sevVariant(bucket) {
  return SEV_VARIANT[String(bucket || '').toUpperCase()] || 'muted';
}

// Coerce a possibly-blank ("" for rows with no context) numeric field to a
// number or null, so fmtMoney shows "—" instead of "0.00".
function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// First non-blank value (handles "" and 0 distinctly: 0 is kept).
function firstVal(...vals) {
  for (const v of vals) {
    if (v != null && v !== '') return v;
  }
  return '';
}

// ── KPI cards ────────────────────────────────────────────────────────────────
function kpiCard(label, value, opts = {}) {
  return el('div', { class: `card report-kpi${opts.accent ? ' report-kpi--accent' : ''}` }, [
    el('div', { class: 'report-kpi__value h2', text: value }),
    el('div', { class: 'report-kpi__label caption muted', text: label }),
  ]);
}

function kpiCards(kpis) {
  const k = kpis || {};
  return el('div', { class: 'report-kpis' }, [
    kpiCard('Flagged rows', k.flagged_rows != null ? String(k.flagged_rows) : '—'),
    kpiCard('SAR at risk', fmtMoney(k.sar_at_risk), { accent: true }),
    kpiCard('Hard exceptions', k.hard_count != null ? String(k.hard_count) : '—'),
    kpiCard('Risk catches', k.fraud_catches != null ? String(k.fraud_catches) : '—'),
  ]);
}

// ── Category breakdown (proportional bars) + severity badge strip ────────────
function severityStrip(severityCounts) {
  const counts = severityCounts || {};
  const order = ['HARD', 'HIGH', 'MEDIUM', 'INFO'];
  const present = order.filter((s) => Number(counts[s] || 0) > 0);
  if (!present.length) return null;
  return el('div', { class: 'report-sevstrip' }, present.map((s) =>
    el('span', { class: `badge badge--${sevVariant(s)}` }, [`${s} · ${counts[s]}`])));
}

function categoryBars(categories, severityCounts) {
  const entries = Object.entries(categories || {});
  const section = el('div', { class: 'stack gap-3' }, [
    el('div', { class: 'row gap-3', style: 'justify-content:space-between;flex-wrap:wrap;align-items:baseline' }, [
      el('h3', { class: 'h5', text: 'Category breakdown' }),
      severityStrip(severityCounts),
    ]),
  ]);

  if (!entries.length) {
    section.append(el('p', { class: 'body-s muted', text: 'No categorised exceptions.' }));
    return section;
  }

  const max = Math.max(...entries.map(([, c]) => Number(c) || 0), 1);
  const bars = el('div', { class: 'report-cats' }, entries.map(([cat, count]) => {
    const pct = Math.max(4, Math.round((Number(count) || 0) / max * 100));
    return el('div', { class: 'report-cat' }, [
      el('div', { class: 'report-cat__label body-s mono', text: cat }),
      el('div', { class: 'report-cat__track' }, [
        el('div', { class: 'report-cat__fill', style: `width:${pct}%` }),
      ]),
      el('div', { class: 'report-cat__count body-s', text: String(count) }),
    ]);
  }));
  section.append(bars);
  return section;
}

// ── Exceptions table (severity-sorted; server already orders HARD first) ──────
const COLUMNS = [
  { key: 'sl',       label: 'Sl. #' },
  { key: 'severity', label: 'Severity' },
  { key: 'category', label: 'Category' },
  { key: 'employee', label: 'Employee No' },
  { key: 'amount',   label: 'Amount (SAR)', cls: 'report-td--num' },
  { key: 'detail',   label: 'Detail', cls: 'report-td--detail' },
];

function rowCells(row) {
  const sl = firstVal(row.all_sl_nos, row['Sl. #']);
  const employee = firstVal(row['Employee No'], row.emp_no);
  const amount = num(firstVal(row['*Amount'], row.value_at_risk_sar));
  const sevLabel = firstVal(row.severity, row.severity_bucket) || '—';

  return COLUMNS.map((col) => {
    if (col.key === 'severity') {
      return el('td', {}, [
        el('span', { class: `badge badge--${sevVariant(row.severity_bucket || row.severity)}` },
          [String(sevLabel)]),
      ]);
    }
    let text;
    if (col.key === 'sl') text = sl === '' ? '—' : String(sl);
    else if (col.key === 'category') text = row.category || '—';
    else if (col.key === 'employee') text = employee === '' ? '—' : String(employee);
    else if (col.key === 'amount') text = amount == null ? '—' : fmtMoney(amount);
    else if (col.key === 'detail') text = row.detail || '';
    return el('td', { class: col.cls || '', text });
  });
}

function exceptionsTable(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const head = el('thead', {}, [
    el('tr', {}, COLUMNS.map((c) => el('th', { class: c.cls || '', text: c.label }))),
  ]);

  if (!list.length) {
    return el('div', { class: 'stack gap-3' }, [
      el('h3', { class: 'h5', text: 'Exceptions' }),
      el('div', { class: 'notice', text: 'No exception rows in this report.' }),
    ]);
  }

  const body = el('tbody', {}, list.map((r) => el('tr', {}, rowCells(r))));
  return el('div', { class: 'stack gap-3' }, [
    el('div', { class: 'row gap-3', style: 'justify-content:space-between;flex-wrap:wrap;align-items:baseline' }, [
      el('h3', { class: 'h5', text: 'Exceptions' }),
      el('span', { class: 'caption muted', text: `${list.length} row${list.length === 1 ? '' : 's'} · severity-sorted` }),
    ]),
    el('div', { class: 'report-tablewrap' }, [
      el('table', { class: 'report-table' }, [head, body]),
    ]),
  ]);
}

/**
 * ReportTable(payload) → { node }
 * payload is the GET ?format=json body: {kpis, categories, severity_counts, rows, …}.
 */
export function ReportTable(payload) {
  const p = payload || {};
  const node = el('div', { class: 'stack gap-6 report' }, [
    kpiCards(p.kpis),
    categoryBars(p.categories, p.severity_counts),
    exceptionsTable(p.rows),
  ]);
  return { node };
}
