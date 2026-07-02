// ============================================================================
// components/evidence-tree.js — EvidenceTree.
//
// Consumes GET /api/v2/runs/<id>/evidence/tree. IMPORTANT: that endpoint serves
// the worker's evidence-tree.json snapshot verbatim, which is FLAT — not the
// nested folders[]→files[] shape the design spec sketched. The real payload is:
//
//   { evidence_root, captured_at, folder_count, file_count,
//     folders: [{rel, mtime}, …],                       // flat; rel may be "."
//     files:   [{rel, name, ext, bytes, mtime}, …] }    // flat; rel = full path
//
// So this component builds the directory hierarchy CLIENT-SIDE from each file's
// `rel` path (and seeds empty dirs + folder mtimes from `folders`). Folders lazily
// build + reveal their children on first expand (the snapshot can hold hundreds
// of files). Every row is keyboard-operable; clicking a file calls onSelect(file).
//
// Brand tokens only. Returns { node }. Also exports fmtBytes + fileIconName so the
// reader pane shares the exact same icon/size vocabulary.
// ============================================================================

import { el, icon, absTime } from '../app.js';
import { prefersReducedMotion } from '../motion.js';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff']);
const SHEET_EXTS = new Set(['xlsx', 'xls', 'csv']);

/** Map a file extension → a Lucide icon name (msg/eml/pdf/xlsx/img/other). */
export function fileIconName(ext) {
  const e = String(ext || '').toLowerCase();
  if (e === 'msg' || e === 'eml') return 'mail';
  if (e === 'pdf') return 'file-text';
  if (SHEET_EXTS.has(e)) return 'file-spreadsheet';
  if (IMAGE_EXTS.has(e)) return 'image';
  return 'file';
}

/** Humanize a byte count: "812 B", "41.1 KB", "1.2 MB". */
export function fmtBytes(n) {
  if (n == null || Number.isNaN(Number(n))) return '';
  const b = Number(n);
  if (b < 1024) return `${b} B`;
  const kb = b / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/** Compact mtime for the column (date only); full timestamp lives in the title. */
function fmtDate(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString();
}

// ── Tree model ────────────────────────────────────────────────────────────────
function makeDir(name, rel) {
  return { name, rel, mtime: null, dirs: new Map(), files: [] };
}

function ensureDir(root, relPath, mtime) {
  if (!relPath || relPath === '.') return root;
  let node = root;
  const acc = [];
  for (const seg of relPath.split('/')) {
    if (!seg) continue;
    acc.push(seg);
    if (!node.dirs.has(seg)) node.dirs.set(seg, makeDir(seg, acc.join('/')));
    node = node.dirs.get(seg);
  }
  if (mtime) node.mtime = mtime;
  return node;
}

function buildTree(payload) {
  const root = makeDir('', '.');
  for (const f of payload.folders || []) {
    if (!f || f.rel == null) continue;
    if (f.rel === '.') { root.mtime = f.mtime || root.mtime; continue; }
    ensureDir(root, f.rel, f.mtime);
  }
  for (const file of payload.files || []) {
    if (!file || !file.rel) continue;
    const parts = String(file.rel).split('/');
    parts.pop(); // drop the filename → directory segments remain
    const dir = parts.length ? ensureDir(root, parts.join('/')) : root;
    dir.files.push(file);
  }
  return root;
}

/** Total files at or below a directory node (for the folder count badge). */
function countFiles(dir) {
  let n = dir.files.length;
  for (const child of dir.dirs.values()) n += countFiles(child);
  return n;
}

// ── Component ───────────────────────────────────────────────────────────────
export function EvidenceTree(payload, { onSelect } = {}) {
  const root = buildTree(payload);
  const container = el('div', { class: 'evtree', role: 'tree', 'aria-label': 'Evidence files' });
  let selectedRow = null;

  function selectFile(file, rowEl) {
    if (selectedRow) selectedRow.classList.remove('is-selected');
    selectedRow = rowEl;
    if (rowEl) rowEl.classList.add('is-selected');
    if (typeof onSelect === 'function') onSelect(file);
  }

  function indent(depth) { return `${depth * 16 + 8}px`; }

  function fileRow(file, depth) {
    const row = el('div', {
      class: 'evtree__row evtree__file', role: 'treeitem', tabindex: '0', title: file.rel,
      style: `padding-left:${indent(depth)}`,
    }, [
      icon(fileIconName(file.ext), { cls: 'evtree__icon' }),
      el('span', { class: 'evtree__name', text: file.name || file.rel }),
      el('span', { class: 'evtree__bytes caption muted mono', text: fmtBytes(file.bytes) }),
      el('span', { class: 'evtree__mtime caption muted', title: absTime(file.mtime), text: fmtDate(file.mtime) }),
    ]);
    const activate = () => selectFile(file, row);
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
    return row;
  }

  function dirNode(dir, depth) {
    const wrap = el('div', { class: 'evtree__group', role: 'group' });
    const header = el('div', {
      class: 'evtree__row evtree__folder', role: 'treeitem', tabindex: '0', 'aria-expanded': 'false',
      style: `padding-left:${indent(depth)}`,
    }, [
      el('span', { class: 'evtree__twisty' }, [icon('chevron-right')]),
      icon('folder', { cls: 'evtree__icon' }),
      el('span', { class: 'evtree__name', text: dir.name || '/' }),
      el('span', { class: 'evtree__count caption muted', text: String(countFiles(dir)) }),
    ]);
    const childHost = el('div', { class: 'evtree__children', style: 'display:none' });
    let built = false;
    let open = false;

    function setOpen(next) {
      open = next;
      header.setAttribute('aria-expanded', open ? 'true' : 'false');
      header.classList.toggle('is-open', open);
      if (open && !built) { built = true; renderChildren(dir, childHost, depth + 1); }
      childHost.style.display = open ? '' : 'none';
    }
    header.addEventListener('click', () => setOpen(!open));
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); }
      else if (e.key === 'ArrowRight' && !open) { e.preventDefault(); setOpen(true); }
      else if (e.key === 'ArrowLeft' && open) { e.preventDefault(); setOpen(false); }
    });
    wrap.append(header, childHost);
    return wrap;
  }

  function renderChildren(dir, host, depth) {
    const dirs = [...dir.dirs.values()].sort((a, b) => a.name.localeCompare(b.name));
    const files = [...dir.files].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const rows = [];
    for (const d of dirs) { const r = dirNode(d, depth); rows.push(r); host.append(r); }
    for (const f of files) { const r = fileRow(f, depth); rows.push(r); host.append(r); }
    staggerReveal(rows);
  }

  // Stagger-reveal newly rendered rows on expand: each row fades + slides in,
  // with a small incremental delay capped so the whole reveal completes within
  // ~120ms (transform/opacity only). Reduced motion skips it entirely.
  function staggerReveal(rows) {
    if (prefersReducedMotion() || !rows.length) return;
    rows.forEach((row, i) => {
      row.classList.add('evtree__reveal');
      row.style.animationDelay = `${Math.min(i * 16, 120)}ms`;
      row.addEventListener('animationend', function done() {
        row.classList.remove('evtree__reveal');
        row.style.animationDelay = '';
        row.removeEventListener('animationend', done);
      });
    });
  }

  renderChildren(root, container, 0);
  return { node: container };
}

// ============================================================================
// BatchEvidenceTree — lazy, path-scoped folder tree for the BATCH-level evidence
// endpoints (GET …/batches/<id>/evidence/tree?path=<rel>). Unlike the per-run
// snapshot above, this browses the live evidence root one directory at a time:
// each folder fetches its children on first expand. This is what lets the user
// see ALL evidence folders regardless of run state.
//
// Node shape (tolerant — see normNode): {name, rel, type:'dir'|'file', size,
// ext, kind}. Backends that inline `children` on a dir are honored without a
// refetch. fetchChildren(rel) → Promise<rawResponse>; onSelect(file) fires on a
// file click with a {name, rel, ext, bytes, kind} object the MsgReader understands.
//
// Returns { node }.
// ============================================================================

/** Map a backend `kind` (falling back to ext) → a Lucide icon name. */
export function kindIconName(kind, ext) {
  const k = String(kind || '').toLowerCase();
  if (k === 'email') return 'mail';
  if (k === 'pdf') return 'file-text';
  if (k === 'image') return 'image';
  if (k) return 'file';
  return fileIconName(ext);
}

const extFromName = (name) => {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
};

/** Pull a child-node array out of whatever shape the backend returned. */
export function extractNodes(resp) {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp.map(normNode).filter(Boolean);
  // Batch endpoint shape: { …, tree: { type:'dir', rel:'', children:[…] } }.
  // `tree` is a wrapper node for the (sub)directory itself; we want its CHILDREN
  // as the top-level list so the date folders (01jun/02jun/…) become the roots,
  // not a single empty-named wrapper. The backend nests the full subtree inline,
  // so each child already carries its own grandchildren — normNode recurses.
  if (resp.tree && typeof resp.tree === 'object') {
    if (Array.isArray(resp.tree.children)) return resp.tree.children.map(normNode).filter(Boolean);
    // Defensive: a bare dir node with no children array → surface it as a root.
    return [normNode(resp.tree)].filter(Boolean);
  }
  for (const key of ['nodes', 'children', 'entries', 'items']) {
    if (Array.isArray(resp[key])) return resp[key].map(normNode).filter(Boolean);
  }
  // Flat folders+files fallback (mirrors the per-run snapshot shape).
  if (Array.isArray(resp.folders) || Array.isArray(resp.files)) {
    const dirs = (resp.folders || []).filter((f) => f && f.rel && f.rel !== '.')
      .map((f) => normNode({ ...f, type: 'dir' }));
    const files = (resp.files || []).map((f) => normNode({ ...f, type: 'file' }));
    return [...dirs, ...files].filter(Boolean);
  }
  return [];
}

/** Normalise a single node to {name, rel, type, size, ext, kind, children}. */
export function normNode(n) {
  if (!n) return null;
  const rel = n.rel != null ? n.rel : (n.path != null ? n.path : '');
  const name = n.name || String(rel).split('/').filter(Boolean).pop() || rel;
  const ext = String(n.ext || extFromName(name)).toLowerCase();
  const childArr = Array.isArray(n.children) ? n.children
    : (Array.isArray(n.nodes) ? n.nodes : null);
  let type = n.type;
  if (type !== 'dir' && type !== 'file') {
    type = (childArr || n.is_dir || n.dir) ? 'dir'
      : (n.kind || ext || n.size != null || n.bytes != null) ? 'file' : 'dir';
  }
  return {
    name, rel, type, ext,
    size: n.size != null ? n.size : n.bytes,
    kind: n.kind || null,
    children: childArr ? childArr.map(normNode).filter(Boolean) : null,
  };
}

export function BatchEvidenceTree(rootNodes, { fetchChildren, onSelect } = {}) {
  const container = el('div', { class: 'evtree', role: 'tree', 'aria-label': 'Evidence files' });
  let selectedRow = null;

  function selectFile(file, rowEl) {
    if (selectedRow) selectedRow.classList.remove('is-selected');
    selectedRow = rowEl;
    if (rowEl) rowEl.classList.add('is-selected');
    if (typeof onSelect === 'function') onSelect(file);
  }

  function indent(depth) { return `${depth * 16 + 8}px`; }

  function fileRow(node, depth) {
    const row = el('div', {
      class: 'evtree__row evtree__file', role: 'treeitem', tabindex: '0', title: node.rel,
      style: `padding-left:${indent(depth)}`,
    }, [
      icon(kindIconName(node.kind, node.ext), { cls: 'evtree__icon' }),
      el('span', { class: 'evtree__name', text: node.name }),
      el('span', { class: 'evtree__bytes caption muted mono', text: fmtBytes(node.size) }),
    ]);
    const file = { name: node.name, rel: node.rel, ext: node.ext, bytes: node.size, kind: node.kind };
    const activate = () => selectFile(file, row);
    row.addEventListener('click', activate);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
    return row;
  }

  function dirNode(node, depth) {
    const wrap = el('div', { class: 'evtree__group', role: 'group' });
    const header = el('div', {
      class: 'evtree__row evtree__folder', role: 'treeitem', tabindex: '0', 'aria-expanded': 'false',
      style: `padding-left:${indent(depth)}`,
    }, [
      el('span', { class: 'evtree__twisty' }, [icon('chevron-right')]),
      icon('folder', { cls: 'evtree__icon' }),
      el('span', { class: 'evtree__name', text: node.name || '/' }),
    ]);
    const childHost = el('div', { class: 'evtree__children', style: 'display:none' });
    let built = false;
    let open = false;

    async function ensureBuilt() {
      if (built) return;
      built = true;
      // Inline children (backend nested the subtree) → render directly.
      if (Array.isArray(node.children)) { renderNodes(node.children, childHost, depth + 1); return; }
      // Otherwise lazy-fetch this directory's listing.
      childHost.replaceChildren(...Array.from({ length: 3 }, () =>
        el('div', { class: 'skeleton', style: 'height:26px;margin:6px 8px' })));
      let kids = [];
      try {
        kids = extractNodes(await fetchChildren(node.rel));
      } catch (err) {
        childHost.replaceChildren(el('div', { class: 'evtree__loaderr caption' }, [
          icon('alert-triangle'), el('span', { text: 'Could not load folder' }),
        ]));
        built = false; // allow a retry on the next expand
        return;
      }
      childHost.replaceChildren();
      if (!kids.length) {
        childHost.append(el('div', { class: 'evtree__empty caption muted',
          style: `padding-left:${indent(depth + 1)}`, text: 'Empty folder' }));
        return;
      }
      renderNodes(kids, childHost, depth + 1);
    }

    function setOpen(next) {
      open = next;
      header.setAttribute('aria-expanded', open ? 'true' : 'false');
      header.classList.toggle('is-open', open);
      if (open) ensureBuilt();
      childHost.style.display = open ? '' : 'none';
    }
    header.addEventListener('click', () => setOpen(!open));
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); }
      else if (e.key === 'ArrowRight' && !open) { e.preventDefault(); setOpen(true); }
      else if (e.key === 'ArrowLeft' && open) { e.preventDefault(); setOpen(false); }
    });
    wrap.append(header, childHost);
    return wrap;
  }

  function renderNodes(nodes, host, depth) {
    const dirs = nodes.filter((n) => n && n.type === 'dir')
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const files = nodes.filter((n) => n && n.type === 'file')
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true }));
    const rows = [];
    for (const d of dirs) { const r = dirNode(d, depth); rows.push(r); host.append(r); }
    for (const f of files) { const r = fileRow(f, depth); rows.push(r); host.append(r); }
    staggerReveal(rows);
  }

  function staggerReveal(rows) {
    if (prefersReducedMotion() || !rows.length) return;
    rows.forEach((row, i) => {
      row.classList.add('evtree__reveal');
      row.style.animationDelay = `${Math.min(i * 16, 120)}ms`;
      row.addEventListener('animationend', function done() {
        row.classList.remove('evtree__reveal');
        row.style.animationDelay = '';
        row.removeEventListener('animationend', done);
      });
    });
  }

  renderNodes(rootNodes || [], container, 0);
  return { node: container };
}
