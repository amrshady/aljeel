// ============================================================================
// app.js — Portal v2 entry: global fetch wrapper, hash router, view mounting,
//          and shared UI primitives (icons, state chip, toast, formatters).
//
// Vanilla ES modules, no build step. The router resolves:
//   #/                      → Batches (grid)
//   #/runs                  → Runs — global recent runs across all batches
//   #/evidence              → Evidence — batch picker
//   #/evidence/<batch>      → Evidence — browse a batch's evidence snapshot
//   #/b/<batch>             → Runs history (one batch)   (Phase 5)
//   #/b/<batch>/r/<run>     → Run detail                  (Phase 5)
// ============================================================================

import { mount as mountBatches } from './views/batches.js';
import { mount as mountRuns } from './views/runs.js';
import { mount as mountRunDetail } from './views/run-detail.js';
import { mount as mountRunsAll } from './views/runs-all.js';
import { mount as mountEvidenceBrowse } from './views/evidence-browse.js';
import { stopActivePoll } from './poll.js';

// ── Global fetch wrapper ─────────────────────────────────────────────────────
// Targets /api/v2/*. Parses JSON, throws ApiError on failure, and bounces the
// page through Cloudflare Access when the edge session has expired.

export const API_PREFIX = '/api/v2';

export class ApiError extends Error {
  constructor(status, code, message, body = null) {
    super(message || code || `HTTP ${status}`);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

// NOTE: there is intentionally NO automatic location.reload() anywhere in this
// module. A prior version bounced the page through Cloudflare Access on a 401/
// redirect; under a persistent edge failure that produced the flash-then-reload
// flicker loop. Every auth failure now resolves to a STATIC errorState card with
// a manual "Sign in again" button — the only reload is a user click.

export async function apiFetch(path, opts = {}) {
  const url = path.startsWith('/api/') ? path : API_PREFIX + path;
  let res;
  try {
    res = await fetch(url, { credentials: 'same-origin', ...opts });
  } catch (err) {
    // Network failure (or an opaque cross-origin redirect the browser refused to
    // expose). Surface it as a retryable error — NEVER an automatic reload, which
    // would spin the page if the failure persists.
    throw new ApiError(0, 'network_error', `Network error: ${err.message}`);
  }

  // The edge bounced this fetch to the Access IdP on a *different* origin — the
  // session has lapsed. We do NOT auto-reload (that was the flicker loop). Surface
  // it as an auth error so the view renders the static "Sign in again" card.
  if (res.redirected) {
    let crossOrigin = false;
    try { crossOrigin = new URL(res.url).origin !== location.origin; } catch (_e) { /* ignore */ }
    if (crossOrigin) {
      throw new ApiError(401, 'access_required',
        'Your Cloudflare Access session has expired — sign in again.');
    }
  }

  const ctype = res.headers.get('Content-Type') || '';
  const isJson = ctype.includes('application/json');
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (res.status === 401 || res.status === 403) {
    // A plain JSON 401/403 from our OWN API (e.g. the edge could not mint the
    // Access identity, or the session expired). This must NOT reload — that was
    // the bug. Surface it so the view renders a clear "Sign in again / Retry"
    // state. A distinct code (not 'access_required') keeps it visible.
    const code = (payload && payload.error) || 'auth_required';
    const detail = (payload && (payload.detail || payload.message)) ||
      'Your session needs to be refreshed.';
    throw new ApiError(res.status, code, detail, payload);
  }

  if (!res.ok) {
    const code = (payload && payload.error) || 'http_error';
    const detail = (payload && (payload.detail || payload.message)) || res.statusText;
    throw new ApiError(res.status, code, detail, payload);
  }
  return payload;
}

// ── Shared error state ────────────────────────────────────────────────────────
// A consistent failure card with a Retry, plus a one-shot "Sign in again" reload
// for auth failures (user-initiated, so it can never loop). Views call this in
// their catch blocks instead of inventing their own notice.
export function errorState(err, { onRetry } = {}) {
  const isApi = err instanceof ApiError;
  const status = isApi ? err.status : 0;
  const code = isApi ? err.code : 'error';
  const isAuth = status === 401 || status === 403;

  const actions = el('div', { class: 'row gap-2', style: 'margin-top:16px' });
  if (typeof onRetry === 'function') {
    actions.append(el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: onRetry },
      [icon('refresh-cw'), 'Retry']));
  }
  if (isAuth) {
    actions.append(el('button', { class: 'btn btn--primary btn--sm', type: 'button',
      onclick: () => location.reload() }, ['Sign in again']));
  }

  return el('div', { class: 'notice notice--error' }, [
    el('div', { class: 'h5', text: isAuth ? 'Your session needs a refresh' : 'Couldn’t load' }),
    el('div', { class: 'body-s muted', text: isAuth
      ? 'Your Cloudflare Access session may have expired. Click “Sign in again”, or retry.'
      : `${code}: ${err.message}` }),
    actions,
  ]);
}

// ── DOM helper ────────────────────────────────────────────────────────────────
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return node;
}

// ── Lucide icons (outline, 1.5px, currentColor) ──────────────────────────────
// Inlined path data so we ship no icon dependency. Defaults match the brand:
// 20px inline, 1.5 stroke, no fill.
const LUCIDE = {
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
  play: '<polygon points="5 3 19 12 5 21 5 3"/>',
  'refresh-cw': '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
  'check-circle': '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  'x-circle': '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  'alert-triangle': '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  'chevron-right': '<polyline points="9 18 15 12 9 6"/>',
  'arrow-left': '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
  terminal: '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  'file-spreadsheet': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M14 13h2"/><path d="M8 17h2"/><path d="M14 17h2"/>',
  'external-link': '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>',
  paperclip: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
  menu: '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
};

/** Return an <svg> Lucide icon node. */
export function icon(name, { size, cls = '', spin = false } = {}) {
  const body = LUCIDE[name] || LUCIDE.file;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon${size === 24 ? ' icon--lg' : ''}${spin ? ' spin' : ''}${cls ? ' ' + cls : ''}`);
  svg.innerHTML = body;
  return svg;
}

// ── State chip (shared across batches/runs/run-detail) ───────────────────────
// Maps a run state → {label, badge variant, icon}. STALLED is an overlay on an
// otherwise-active state (server sets stalled:true from heartbeat+pid).
const STATE_MAP = {
  QUEUED:     { label: 'Queued',     variant: 'warn',  icon: 'clock' },
  PREFLIGHT:  { label: 'Preflight',  variant: 'info',  icon: 'loader', spin: true },
  RUNNING:    { label: 'Running',    variant: 'info',  icon: 'loader', spin: true },
  FINALIZING: { label: 'Finalizing', variant: 'info',  icon: 'loader', spin: true },
  SUCCEEDED:  { label: 'Succeeded',  variant: 'ok',    icon: 'check-circle' },
  FAILED:     { label: 'Failed',     variant: 'err',   icon: 'x-circle' },
  CANCELLED:  { label: 'Cancelled',  variant: 'muted', icon: 'x-circle' },
};

/** Terminal run states — the poll stops and the screen renders "done" here. */
export const TERMINAL_STATES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
export const isTerminal = (state) => TERMINAL_STATES.has(state);

export function stateChip(state, stalled = false) {
  if (stalled && state && !TERMINAL_STATES.has(state)) {
    return el('span', { class: 'badge badge--alert' }, [icon('alert-triangle'), 'Stalled']);
  }
  const m = STATE_MAP[state] || { label: state || 'Unknown', variant: 'muted', icon: 'clock' };
  return el('span', { class: `badge badge--${m.variant}` }, [icon(m.icon, { spin: m.spin }), m.label]);
}

// ── Formatters ────────────────────────────────────────────────────────────────
export function timeAgo(iso) {
  if (!iso) return '—';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '—';
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 0) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(then).toLocaleDateString();
}

export function absTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleString();
}

/** Short, human run id: trailing token of 'J26-925-…-a1b2c3'. */
export const shortRun = (runId) => (runId ? String(runId).split('-').pop() : '');

export const fmtMoney = (n) =>
  n == null ? '—' : Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Human duration from seconds: "47s", "1m 46s", "1h 04m". */
export function fmtDuration(sec) {
  if (sec == null || Number.isNaN(Number(sec))) return '—';
  const s = Math.max(0, Math.round(Number(sec)));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${String(rs).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${String(m % 60).padStart(2, '0')}m`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
// `action` (optional) renders a clickable link inside the toast and gives it a
// longer dwell — used by the run-trigger 409 path to link to the active run.
export function toast(message, kind = 'info', action = null) {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = el('div', { id: 'toast-host' });
    Object.assign(host.style, { position: 'fixed', right: '20px', bottom: '20px', display: 'flex',
      flexDirection: 'column', gap: '8px', zIndex: 1000 });
    document.body.append(host);
  }
  const t = el('div', { class: 'card body-s' }, [el('span', { text: message })]);
  Object.assign(t.style, { padding: '10px 16px', borderLeft: '3px solid var(--action)', maxWidth: '360px',
    boxShadow: 'var(--shadow-pop)', display: 'flex', alignItems: 'center', gap: '12px' });
  if (kind === 'error') t.style.borderLeftColor = 'var(--err)';
  if (kind === 'ok') t.style.borderLeftColor = 'var(--ok)';
  if (kind === 'warn') t.style.borderLeftColor = 'var(--warn)';

  if (action && action.label) {
    const link = el('a', { class: 'body-s', href: action.href || '#',
      style: 'font-weight:600;white-space:nowrap;cursor:pointer',
      text: action.label });
    if (typeof action.onClick === 'function') {
      link.addEventListener('click', (e) => { e.preventDefault(); action.onClick(); t.remove(); });
    }
    t.append(link);
  }
  host.append(t);
  const dwell = action ? 7000 : 3600;
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0';
    setTimeout(() => t.remove(), 300); }, dwell);
}

/** Navigate by hash (used by views instead of touching location directly). */
export function navigate(hash) { location.hash = hash; }

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function crumb(label, hash, current = false) {
  if (current) return el('li', { 'aria-current': 'page', text: label });
  return el('li', {}, [el('a', { href: hash, text: label })]);
}
function sep() { return el('li', { class: 'sep', 'aria-hidden': 'true', html: '/' }); }

function setBreadcrumb(route) {
  const bc = document.getElementById('breadcrumb');
  bc.replaceChildren();
  const parts = [];
  if (route.name === 'batches') {
    parts.push(crumb('Batches', '#/', true));
  } else if (route.name === 'runsAll') {
    parts.push(crumb('Runs', '#/runs', true));
  } else if (route.name === 'evidence') {
    if (route.params.batchId) {
      parts.push(crumb('Evidence', '#/evidence'), sep(), crumb(route.params.batchId, '#', true));
    } else {
      parts.push(crumb('Evidence', '#/evidence', true));
    }
  } else if (route.name === 'runs') {
    parts.push(crumb('Batches', '#/'), sep(), crumb(route.params.batchId, `#/b/${route.params.batchId}`, true));
  } else if (route.name === 'run') {
    parts.push(crumb('Batches', '#/'), sep(),
      crumb(route.params.batchId, `#/b/${route.params.batchId}`), sep(),
      crumb(`Run ${shortRun(route.params.runId)}`, '#', true));
  }
  parts.forEach((p) => bc.append(p));
}

// ── Sidebar nav (icons + active highlight + collapse on narrow widths) ────────
// The sidebar markup lives in portal-v2.html; we decorate it here so the icon
// set stays in one place (LUCIDE) and the active item tracks the route.
function setupNav() {
  document.querySelectorAll('.sidenav__item').forEach((a) => {
    const name = a.getAttribute('data-icon');
    if (name && !a.querySelector('svg')) a.prepend(icon(name));
  });

  const shell = document.getElementById('shell');
  const toggle = document.getElementById('navToggle');
  const scrim = document.getElementById('navScrim');
  const closeNav = () => { shell && shell.classList.remove('is-nav-open'); toggle && toggle.setAttribute('aria-expanded', 'false'); };
  if (toggle && !toggle.dataset.wired) {
    toggle.dataset.wired = '1';
    toggle.prepend(icon('menu'));
    toggle.addEventListener('click', () => {
      const open = shell.classList.toggle('is-nav-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }
  if (scrim && !scrim.dataset.wired) { scrim.dataset.wired = '1'; scrim.addEventListener('click', closeNav); }
  // Any nav click closes the off-canvas drawer (no-op on wide screens).
  document.querySelectorAll('.sidenav__item').forEach((a) => {
    if (a.dataset.wired) return;
    a.dataset.wired = '1';
    a.addEventListener('click', closeNav);
  });
}

// Map a route to the top-level nav section it belongs under.
const NAV_FOR_ROUTE = { batches: 'batches', runs: 'batches', run: 'batches', runsAll: 'runs', evidence: 'evidence' };
function setActiveNav(route) {
  const key = NAV_FOR_ROUTE[route.name] || 'batches';
  document.querySelectorAll('.sidenav__item').forEach((a) => {
    a.classList.toggle('is-active', a.getAttribute('data-nav') === key);
  });
}

// ── Router ────────────────────────────────────────────────────────────────────
function parseHash() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  // #/b/<batch>/r/<run>
  let m = raw.match(/^\/b\/([^/]+)\/r\/([^/]+)\/?$/);
  if (m) return { name: 'run', params: { batchId: decodeURIComponent(m[1]), runId: decodeURIComponent(m[2]) } };
  m = raw.match(/^\/b\/([^/]+)\/?$/);
  if (m) return { name: 'runs', params: { batchId: decodeURIComponent(m[1]) } };
  // #/runs — global recent runs across all batches
  if (/^\/runs\/?$/.test(raw)) return { name: 'runsAll', params: {} };
  // #/evidence  and  #/evidence/<batch>
  m = raw.match(/^\/evidence(?:\/([^/]+))?\/?$/);
  if (m) return { name: 'evidence', params: { batchId: m[1] ? decodeURIComponent(m[1]) : null } };
  return { name: 'batches', params: {} };
}

function renderFatal(view, err) {
  view.replaceChildren(errorState(err, { onRetry: () => route() }));
}

async function route() {
  stopActivePoll();                       // tear down any running poll on nav
  const r = parseHash();
  const view = document.getElementById('view');
  setupNav();
  setActiveNav(r);
  setBreadcrumb(r);
  try {
    if (r.name === 'runsAll') return await mountRunsAll(view, r.params);
    if (r.name === 'evidence') return await mountEvidenceBrowse(view, r.params);
    if (r.name === 'runs') return await mountRuns(view, r.params);
    if (r.name === 'run') return await mountRunDetail(view, r.params);
    return await mountBatches(view, r.params);
  } catch (err) {
    // Always render a static error (incl. access_required). Never silently return
    // into a blank/skeleton screen — that read as a stuck/looping page.
    renderFatal(view, err);
  }
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);
// In case the module loads after DOMContentLoaded has already fired.
if (document.readyState !== 'loading') route();
