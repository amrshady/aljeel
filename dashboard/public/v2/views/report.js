// ============================================================================
// views/report.js — the "Risk & Inconsistencies" tab body (inside run-detail).
//
// Built as ReportView(runId) → { node, load() }, mirroring EvidenceView: the
// node is created synchronously so run-detail can drop it into the tab panel,
// and the report fetch is deferred to load(), which run-detail calls the FIRST
// time the tab is opened (lazy — never fetched for a run nobody inspects).
//
// Because of G-LOCKED #3 the report is AUTO-generated + cached at FINALIZING,
// so GET ?format=json (which also builds-on-demand server-side) almost always
// returns a payload immediately. We still handle the not-yet-generated case
// (run_not_found / report_payload_unavailable) with a clean "Generate" state.
//
// [Regenerate] POSTs /report. The REAL endpoint is SYNCHRONOUS — it returns
// 200 {state:'ready', generated_at} once the subprocess finishes (no 202/poll),
// so we simply await it then re-fetch the json. (No shared poller is touched,
// which also avoids colliding with run-detail's run-state poll.)
//
// Downloads: plain <a download> hitting ?format=xlsx / ?format=md so the browser
// fetches natively, carrying the Cloudflare Access cookie + Content-Disposition.
// These are SEPARATE report downloads — the SPLIT spreadsheet remains the only
// run-OUTPUT download (Output tab).
// ============================================================================

import { el, icon, absTime, toast } from '../app.js';
import { reportJson, generateReport, reportXlsxUrl, reportMdUrl } from '../api.js';
import { ReportTable } from '../components/report-table.js';

// Error codes that mean "no report exists yet" rather than a transient failure.
const NO_REPORT_CODES = new Set(['report_not_found', 'report_payload_unavailable', 'run_dir_not_found']);

export function ReportView(runId) {
  const node = el('div', { class: 'report-view' });
  let loaded = false;
  let busy = false; // a generate/regenerate is in flight

  // ── Loading skeleton ───────────────────────────────────────────────────────
  function skeleton() {
    node.replaceChildren(el('div', { class: 'stack gap-6' }, [
      el('div', { class: 'report-kpis' }, Array.from({ length: 4 }, () =>
        el('div', { class: 'skeleton', style: 'height:96px' }))),
      el('div', { class: 'skeleton', style: 'height:160px' }),
      el('div', { class: 'skeleton', style: 'height:280px' }),
    ]));
  }

  // ── Toolbar (Regenerate + downloads), shown above a rendered report ─────────
  function toolbar(payload) {
    const regen = el('button', { class: 'btn btn--secondary btn--sm', type: 'button' },
      [icon('refresh-cw'), 'Regenerate']);
    regen.addEventListener('click', () => runGenerate(regen));
    if (busy) {
      regen.setAttribute('disabled', '');
      regen.replaceChildren(icon('loader', { spin: true }), 'Generating…');
    }

    const gen = payload && payload.generated_at ? `Generated ${absTime(payload.generated_at)}` : '';

    return el('div', { class: 'report-view__bar' }, [
      el('div', { class: 'stack gap-1' }, [
        el('h2', { class: 'h4', text: 'Risk & Inconsistencies' }),
        gen ? el('div', { class: 'caption muted', text: gen }) : null,
      ]),
      el('div', { class: 'row gap-2', style: 'flex-wrap:wrap' }, [
        regen,
        el('a', { class: 'btn btn--secondary btn--sm', href: reportXlsxUrl(runId),
          download: '', rel: 'noopener' }, [icon('file-spreadsheet'), 'Download .xlsx']),
        el('a', { class: 'btn btn--secondary btn--sm', href: reportMdUrl(runId),
          download: '', rel: 'noopener' }, [icon('file-text'), 'Download .md']),
      ]),
    ]);
  }

  function renderReport(payload) {
    const table = ReportTable(payload);
    node.replaceChildren(el('div', { class: 'stack gap-5' }, [toolbar(payload), table.node]));
  }

  // ── "No report yet" empty state with a Generate CTA ─────────────────────────
  function renderEmpty() {
    const gen = el('button', { class: 'btn btn--primary', type: 'button' },
      [icon('refresh-cw'), 'Generate report']);
    gen.addEventListener('click', () => runGenerate(gen));
    if (busy) {
      gen.setAttribute('disabled', '');
      gen.replaceChildren(icon('loader', { spin: true }), 'Generating…');
    }
    node.replaceChildren(el('div', { class: 'notice' }, [
      icon('alert-triangle', { size: 24 }),
      el('div', { class: 'h5', text: 'No report yet' }),
      el('div', { class: 'body-s muted', style: 'margin-bottom:16px',
        text: 'This run has no Risk & Inconsistencies report. Generate it from the run’s output.' }),
      gen,
    ]));
  }

  function renderError(err, allowRetry) {
    const retry = el('button', { class: 'btn btn--secondary btn--sm', type: 'button' },
      [icon('refresh-cw'), 'Retry']);
    retry.addEventListener('click', () => { loaded = false; load(); });
    node.replaceChildren(el('div', { class: 'notice notice--error' }, [
      icon('alert-triangle', { size: 24 }),
      el('div', { class: 'h5', text: 'Could not load report' }),
      el('div', { class: 'body-s muted', style: 'margin-bottom:16px',
        text: `${(err && err.code) || 'error'}: ${(err && err.message) || ''}` }),
      allowRetry ? retry : null,
    ]));
  }

  // ── POST /report (synchronous), then re-fetch json ──────────────────────────
  async function runGenerate(btn) {
    if (busy) return;
    busy = true;
    if (btn) {
      btn.setAttribute('disabled', '');
      btn.replaceChildren(icon('loader', { spin: true }), 'Generating…');
    }
    try {
      await generateReport(runId);          // 200 {state:'ready'} — sync, no poll
      const payload = await reportJson(runId);
      busy = false;
      renderReport(payload);
      toast('Report regenerated', 'ok');
    } catch (err) {
      busy = false;
      toast(`Generate failed: ${(err && err.code) || 'error'}`, 'error');
      // Re-render whatever state we can so the button resets.
      try {
        const payload = await reportJson(runId);
        renderReport(payload);
      } catch (_e) {
        renderEmpty();
      }
    }
  }

  // ── Lazy first load ─────────────────────────────────────────────────────────
  async function load() {
    if (loaded) return;
    loaded = true;
    skeleton();
    try {
      const payload = await reportJson(runId);
      renderReport(payload);
    } catch (err) {
      if (err && NO_REPORT_CODES.has(err.code)) { renderEmpty(); return; }
      loaded = false; // transient — allow a retry next time the tab is opened
      renderError(err, true);
    }
  }

  return { node, load };
}
