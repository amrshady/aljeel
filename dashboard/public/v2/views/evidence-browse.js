// ============================================================================
// views/evidence-browse.js — Evidence (#/evidence): browse evidence BY BATCH,
// independent of run state.
//
//   #/evidence            → batch picker (cards → #/evidence/<batch>)
//   #/evidence/<batch>    → batch-level two-pane browser:
//                             left  = lazy folder tree (date → ticket → files)
//                             right = preview pane (PDF inline / email / image)
//
// This reads the BATCH evidence root directly (GET …/batches/<id>/evidence/*),
// so every folder is visible even mid-run or with zero runs — fixing the old
// "evidence folders are not visible" complaint (which showed only a per-run
// snapshot). If the batch endpoints aren't live yet, the tree degrades to a
// clear "evidence indexing…" state with a Retry — never a crash or spinner loop.
// ============================================================================

import { el, icon, navigate, errorState, ApiError } from '../app.js';
import {
  listBatches,
  batchEvidenceTree, batchEvidenceFileUrl, batchEvidenceMsg, batchMsgAttachmentUrl,
} from '../api.js';
import { BatchEvidenceTree, extractNodes } from '../components/evidence-tree.js';
import { MsgReader } from '../components/msg-reader.js';

export async function mount(view, { batchId } = {}) {
  if (batchId) return mountBatch(view, batchId);
  return mountPicker(view);
}

// ── #/evidence — pick a batch ─────────────────────────────────────────────────
async function mountPicker(view) {
  const head = el('div', { class: 'page-head' }, [
    el('h1', { class: 'h2 page-head__title', text: 'Evidence' }),
    el('p', { class: 'body-s muted page-head__caption',
      text: 'Browse the source evidence (emails, invoices, attachments) captured for each batch — any time, regardless of run state.' }),
  ]);
  const grid = el('div', { class: 'grid' });
  view.replaceChildren(head, grid);
  grid.replaceChildren(...Array.from({ length: 6 }, () => el('div', { class: 'skeleton', style: 'height:88px' })));

  let batches;
  try {
    const data = await listBatches();
    batches = (data && data.batches) || [];
  } catch (err) {
    grid.replaceChildren(errorState(err, { onRetry: () => mountPicker(view) }));
    return;
  }

  if (!batches.length) {
    grid.replaceChildren(el('div', { class: 'notice' }, [
      icon('inbox', { size: 24 }),
      el('div', { class: 'h5', text: 'No batches found' }),
    ]));
    return;
  }

  grid.replaceChildren(...batches.map((b) => {
    const goto = () => navigate(`#/evidence/${encodeURIComponent(b.batch_id)}`);
    return el('div', {
      class: 'card', role: 'button', tabindex: '0',
      style: 'padding:18px 20px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:16px;transition:box-shadow .2s var(--ease),transform .2s var(--ease)',
      onclick: goto,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goto(); } },
      onmouseenter: (e) => { e.currentTarget.style.boxShadow = 'var(--shadow-pop)'; e.currentTarget.style.transform = 'translateY(-2px)'; },
      onmouseleave: (e) => { e.currentTarget.style.boxShadow = 'var(--shadow-card)'; e.currentTarget.style.transform = 'none'; },
    }, [
      el('div', { class: 'row gap-2' }, [icon('folder', { size: 24 }), el('span', { class: 'h4', text: b.batch_id })]),
      el('span', { class: 'badge badge--muted' }, [icon('file'), `${b.item_count ?? 0} items`]),
    ]);
  }));
}

// ── #/evidence/<batch> — batch-level two-pane evidence browser ─────────────────
async function mountBatch(view, batchId) {
  const head = el('div', { class: 'page-head' }, [
    el('div', { class: 'row gap-3', style: 'justify-content:space-between;flex-wrap:wrap' }, [
      el('div', {}, [
        el('h1', { class: 'h2 page-head__title', text: `Evidence — ${batchId}` }),
        el('p', { class: 'body-s muted page-head__caption',
          text: 'Browse this batch’s evidence folders and open any file — available even mid-run.' }),
      ]),
      el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => navigate('#/evidence') },
        [icon('arrow-left'), 'All batches']),
    ]),
  ]);

  // Breadcrumb of the currently-previewed file's path (updates on select).
  const crumb = el('div', { class: 'ev-crumb caption muted' });
  function setCrumb(rel) {
    const segs = String(rel || '').split('/').filter(Boolean);
    if (!segs.length) { crumb.replaceChildren(icon('folder'), el('span', { text: batchId })); return; }
    const parts = [icon('folder'), el('span', { text: batchId })];
    segs.forEach((s, i) => {
      parts.push(el('span', { class: 'ev-crumb__sep', text: '/' }));
      parts.push(el('span', { class: i === segs.length - 1 ? 'ev-crumb__cur' : '', text: s }));
    });
    crumb.replaceChildren(...parts);
  }
  setCrumb('');

  // Two-pane shell (reuses the evidence grid + reader CSS).
  const treeHead = el('div', { class: 'evidence__treehead caption muted' });
  const treePane = el('div', { class: 'evidence__tree' }, [treeHead]);

  const source = {
    fileUrl: (rel) => batchEvidenceFileUrl(batchId, rel),
    readMsg: (rel) => batchEvidenceMsg(batchId, rel),
    attachmentUrl: (rel, idx) => batchMsgAttachmentUrl(batchId, rel, idx),
  };
  const reader = MsgReader(source);
  const readerPane = el('div', { class: 'evidence__reader' }, [reader.node]);

  const pane = el('div', { class: 'evidence' }, [treePane, readerPane]);
  view.replaceChildren(head, crumb, pane);

  await loadTree();

  async function loadTree() {
    treeHead.textContent = 'Loading…';
    treePane.replaceChildren(treeHead, ...Array.from({ length: 7 }, () =>
      el('div', { class: 'skeleton', style: 'height:30px;margin-bottom:8px' })));

    let resp;
    try {
      resp = await batchEvidenceTree(batchId, '');
    } catch (err) {
      // Endpoints not live yet (404) or backend still indexing → graceful state,
      // NOT an error card or spinner loop.
      const status = err instanceof ApiError ? err.status : 0;
      const code = err instanceof ApiError ? String(err.code || '') : '';
      const indexing = status === 404 || status === 425 || /not_ready|indexing|building|no_evidence|not_found/i.test(code);
      if (indexing) { renderIndexing(); return; }
      treePane.replaceChildren(errorState(err, { onRetry: () => loadTree() }));
      return;
    }

    const nodes = extractNodes(resp);
    if (!nodes.length) {
      treePane.replaceChildren(el('div', { class: 'notice' }, [
        icon('inbox', { size: 24 }),
        el('div', { class: 'h5', text: 'No evidence files' }),
        el('div', { class: 'body-s muted', text: 'This batch’s evidence root is empty.' }),
      ]));
      return;
    }

    const dirs = nodes.filter((n) => n.type === 'dir').length;
    const files = nodes.filter((n) => n.type === 'file').length;
    treeHead.textContent =
      `${nodes.length} item${nodes.length === 1 ? '' : 's'} · ${dirs} folder${dirs === 1 ? '' : 's'}, ${files} file${files === 1 ? '' : 's'}`;

    const tree = BatchEvidenceTree(nodes, {
      fetchChildren: (rel) => batchEvidenceTree(batchId, rel),
      onSelect: (file) => { setCrumb(file.rel); reader.open(file); },
    });
    treePane.replaceChildren(treeHead, tree.node);
    reader.clear();
  }

  function renderIndexing() {
    treePane.replaceChildren(el('div', { class: 'notice' }, [
      icon('loader', { size: 24, spin: true }),
      el('div', { class: 'h5', text: 'Evidence indexing…' }),
      el('div', { class: 'body-s muted',
        text: 'This batch’s evidence index isn’t ready yet. It becomes browsable once indexing completes.' }),
      el('div', { class: 'row', style: 'justify-content:center;margin-top:16px' }, [
        el('button', { class: 'btn btn--secondary btn--sm', type: 'button', onclick: () => loadTree() },
          [icon('refresh-cw'), 'Retry']),
      ]),
    ]));
    reader.clear();
  }
}
