// ============================================================================
// components/download-button.js — immutable run-artifact download controls.
//
// Serves the run's snapshotted SPLIT and three-sheet REVIEW workbooks. Controls
// stay disabled until the corresponding artifact is present in the manifest.
//
// Implemented as an <a download> so the browser fetches natively, carrying the
// Cloudflare Access cookie and honoring Content-Disposition.
//
// Returns { node, update(split, asOf) }.
// ============================================================================

import { el, icon, absTime } from '../app.js';
import { downloadUrl, reviewDownloadUrl } from '../api.js';

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

export function ReviewDownloadButton(runId) {
  const btn = el('a', {
    class: 'btn btn--secondary btn--download is-disabled',
    role: 'button',
    'aria-disabled': 'true',
  }, [icon('file-spreadsheet'), 'Download Review Workbook (3-sheet)']);
  const name = el('div', { class: 'body-s mono', text: '' });
  const meta = el('div', { class: 'caption muted', text: 'Available once the run finalizes.' });
  const node = el('div', { class: 'stack gap-2' }, [
    btn,
    el('div', { class: 'stack gap-1' }, [name, meta]),
  ]);

  function update(review) {
    if (review && review.rel) {
      btn.setAttribute('href', reviewDownloadUrl(runId));
      btn.setAttribute('download', review.name || '');
      btn.classList.remove('is-disabled');
      btn.removeAttribute('aria-disabled');
      name.textContent = review.name || review.rel;
      meta.textContent = [fmtBytes(review.bytes), review.sha256 ? `sha256 ${String(review.sha256).slice(0, 12)}…` : '']
        .filter(Boolean).join(' · ');
    } else {
      btn.removeAttribute('href');
      btn.removeAttribute('download');
      btn.classList.add('is-disabled');
      btn.setAttribute('aria-disabled', 'true');
      name.textContent = '';
      meta.textContent = 'No review workbook yet — available once the run finalizes.';
    }
  }

  return { node, update };
}
