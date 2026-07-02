// ============================================================================
// components/download-button.js — DownloadButton (SPLIT only).
//
// The single download surface in Portal v2. Serves GET /api/v2/runs/<id>/download
// which streams the run's snapshotted *-FILLED-v30-SPLIT.xlsx. There is no /full
// anywhere. The button is disabled until the run's `artifacts.split` manifest is
// present (i.e. FINALIZING produced one); it shows the artifact name + size and
// an "as of <ts>" line so the user knows which snapshot they're pulling.
//
// Implemented as an <a download> so the browser fetches natively, carrying the
// Cloudflare Access cookie and honoring Content-Disposition.
//
// Returns { node, update(split, asOf) }.
// ============================================================================

import { el, icon, absTime } from '../app.js';
import { downloadUrl } from '../api.js';

function fmtBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  const b = Number(n);
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function DownloadButton(runId) {
  const btn = el('a', { class: 'btn btn--primary btn--download', role: 'button' }, [icon('download'), 'Download']);
  const name = el('div', { class: 'body-s mono', text: '' });
  const meta = el('div', { class: 'caption muted', text: '' });
  const asOfLine = el('div', { class: 'caption muted', text: '' });

  const node = el('div', { class: 'stack gap-2' }, [
    btn,
    el('div', { class: 'stack gap-1' }, [name, meta, asOfLine]),
  ]);

  function update(split, asOf) {
    if (split && split.rel) {
      btn.setAttribute('href', downloadUrl(runId));
      btn.setAttribute('download', split.name || '');
      btn.classList.remove('is-disabled');
      btn.removeAttribute('aria-disabled');
      name.textContent = split.name || split.rel;
      meta.textContent = [fmtBytes(split.bytes), split.sha256 ? `sha256 ${String(split.sha256).slice(0, 12)}…` : '']
        .filter(Boolean).join(' · ');
    } else {
      btn.removeAttribute('href');
      btn.removeAttribute('download');
      btn.classList.add('is-disabled');
      btn.setAttribute('aria-disabled', 'true');
      name.textContent = '';
      meta.textContent = 'No split artifact yet — available once the run finalizes.';
    }
    asOfLine.textContent = asOf ? `as of ${absTime(asOf)}` : '';
  }

  return { node, update };
}
