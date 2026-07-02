// ============================================================================
// views/evidence.js — the Evidence tab body (mounted inside run-detail).
//
// A two-pane layout: EvidenceTree on the left (this run's snapshotted evidence
// listing), the MsgReader pane on the right. Selecting a file in the tree opens
// it in the reader. Responsive: the two panes stack on narrow viewports (CSS).
//
// Built as EvidenceView(runId) → { node, load() }. The node is created instantly
// (so run-detail can drop it into the Evidence tab panel synchronously); the tree
// fetch is deferred to load(), which run-detail calls the FIRST time the Evidence
// tab is opened — so we never fetch evidence for a run the user never inspects.
//
// States:
//   • loading      → shimmer skeleton rows in the tree pane.
//   • no snapshot  → clean full-pane message (404 evidence_tree_not_found; e.g. a
//                    run that never reached FINALIZING).
//   • empty tree   → "No evidence files" in the tree pane.
//   • nothing sel. → reader shows "Select a file to preview".
// ============================================================================

import { el, icon, absTime } from '../app.js';
import { evidenceTree } from '../api.js';
import { EvidenceTree } from '../components/evidence-tree.js';
import { MsgReader } from '../components/msg-reader.js';

export function EvidenceView(runId) {
  const reader = MsgReader(runId);
  const treePane = el('div', { class: 'evidence__tree' });
  const readerPane = el('div', { class: 'evidence__reader' }, [reader.node]);
  const node = el('div', { class: 'evidence' }, [treePane, readerPane]);
  let loaded = false;

  function skeletons() {
    treePane.replaceChildren(...Array.from({ length: 7 }, () =>
      el('div', { class: 'skeleton', style: 'height:30px;margin-bottom:8px' })));
  }

  function treeHeader(data) {
    const fc = data.file_count != null ? data.file_count : (data.files || []).length;
    const dc = data.folder_count != null ? data.folder_count : (data.folders || []).length;
    const cap = data.captured_at ? ` · snapshot ${absTime(data.captured_at)}` : '';
    return el('div', { class: 'evidence__treehead caption muted', text: `${fc} files · ${dc} folders${cap}` });
  }

  function renderNoSnapshot() {
    node.replaceChildren(el('div', { class: 'notice' }, [
      icon('folder', { size: 24 }),
      el('div', { class: 'h5', text: 'No evidence snapshot' }),
      el('div', { class: 'body-s muted', text: 'This run has no captured evidence tree yet. The snapshot is written when a run finalizes.' }),
    ]));
  }

  function renderEmpty() {
    treePane.replaceChildren(el('div', { class: 'notice' }, [
      icon('inbox', { size: 24 }),
      el('div', { class: 'h5', text: 'No evidence files' }),
      el('div', { class: 'body-s muted', text: 'The snapshot for this run contains no files.' }),
    ]));
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    skeletons();
    let data;
    try {
      data = await evidenceTree(runId);
    } catch (err) {
      if (err && err.code === 'evidence_tree_not_found') { renderNoSnapshot(); return; }
      loaded = false; // transient — allow a retry next time the tab is opened
      treePane.replaceChildren(el('div', { class: 'notice notice--error' }, [
        icon('alert-triangle', { size: 24 }),
        el('div', { class: 'h5', text: 'Could not load evidence' }),
        el('div', { class: 'body-s muted', text: `${(err && err.code) || 'error'}: ${(err && err.message) || ''}` }),
      ]));
      return;
    }

    const files = data.files || [];
    const folders = data.folders || [];
    if (!files.length && !folders.length) { renderEmpty(); return; }

    const tree = EvidenceTree(data, { onSelect: (file) => reader.open(file) });
    treePane.replaceChildren(treeHeader(data), tree.node);
  }

  return { node, load };
}
