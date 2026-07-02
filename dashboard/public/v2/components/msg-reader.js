// ============================================================================
// components/msg-reader.js — MsgReader (the evidence reader pane).
//
// Renders whatever evidence file the tree hands it:
//   • .msg / .eml → GET …/evidence/file?rel=… returns structured JSON
//        {type,subject,from,to[],date,body,attachments[{index,name}]}
//     We render a structured email card. The body and every header are written
//     with textContent (el's `text:`) — NEVER innerHTML — so a hostile email can
//     never inject markup/script. Line breaks are preserved purely via CSS
//     (white-space: pre-wrap). Attachments are chips that download via
//     …/evidence/msg-attachment?rel=&attachment=<idx>.
//   • .pdf  → streamed inline by the endpoint; shown in an <iframe> with an
//     open-in-new-tab / download toolbar.
//   • images → shown inline (<img>) with the same toolbar.
//   • .xlsx / other binaries → no inline render; a clean download affordance.
//
// All query params are URL-encoded by the api.js wrappers; `rel` is passed
// through unchanged (the server owns the path-traversal guard).
//
// SOURCE ABSTRACTION — the reader is agnostic to whether it's showing a per-run
// snapshot or a batch's live evidence root. It takes a `source`:
//   { fileUrl(rel), readMsg(rel) → Promise<emailJson>, attachmentUrl(rel, idx) }
// For backward compatibility, passing a runId string builds the run-level source
// (per-run /runs/<id>/evidence/* endpoints) automatically.
//
// Returns { node, open(file), clear() }.
// ============================================================================

import { el, icon, absTime } from '../app.js';
import { evidenceFileJson, evidenceFileUrl, msgAttachmentUrl } from '../api.js';
import { fmtBytes, fileIconName } from './evidence-tree.js';

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tif', 'tiff']);

// Build the per-run source from a runId string (legacy callers pass the id).
function runSource(runId) {
  return {
    fileUrl: (rel) => evidenceFileUrl(runId, rel),
    readMsg: (rel) => evidenceFileJson(runId, rel),
    attachmentUrl: (rel, idx) => msgAttachmentUrl(runId, rel, idx),
  };
}

export function MsgReader(sourceOrRunId) {
  const source = typeof sourceOrRunId === 'string' ? runSource(sourceOrRunId) : sourceOrRunId;
  const host = el('div', { class: 'evreader' });

  function placeholder() {
    return el('div', { class: 'notice' }, [
      icon('file-text', { size: 24 }),
      el('div', { class: 'h5', text: 'Select a file to preview' }),
      el('div', { class: 'body-s muted', text: 'Choose a file from the evidence tree to view it here.' }),
    ]);
  }

  function clear() { host.replaceChildren(placeholder()); }

  function skeleton() {
    return el('div', { class: 'stack gap-3' }, [
      el('div', { class: 'skeleton', style: 'height:28px;width:60%' }),
      el('div', { class: 'skeleton', style: 'height:16px;width:40%' }),
      el('div', { class: 'skeleton', style: 'height:200px' }),
    ]);
  }

  function errNotice(title, err) {
    return el('div', { class: 'notice notice--error' }, [
      icon('alert-triangle', { size: 24 }),
      el('div', { class: 'h5', text: title }),
      el('div', { class: 'body-s muted', text: `${(err && err.code) || 'error'}: ${(err && err.message) || 'Unknown error'}` }),
    ]);
  }

  // Shared toolbar for inline-rendered docs (pdf / image) and binaries.
  function toolbar(file) {
    const url = source.fileUrl(file.rel);
    return el('div', { class: 'evreader__bar' }, [
      el('div', { class: 'evreader__barinfo' }, [
        icon(fileIconName(file.ext), { cls: 'evtree__icon' }),
        el('span', { class: 'body-s', text: file.name || file.rel }),
        el('span', { class: 'caption muted mono', text: fmtBytes(file.bytes) }),
      ]),
      el('div', { class: 'row gap-2' }, [
        el('a', { class: 'btn btn--secondary btn--sm', href: url, target: '_blank', rel: 'noopener' },
          [icon('external-link'), 'Open in new tab']),
        el('a', { class: 'btn btn--primary btn--sm', href: url, download: file.name || '' },
          [icon('download'), 'Download']),
      ]),
    ]);
  }

  // ── .msg / .eml structured email ──────────────────────────────────────────
  function metaRow(label, value) {
    if (!value) return null;
    return el('div', { class: 'evreader__meta' }, [
      el('span', { class: 'caption muted evreader__metalabel', text: label }),
      el('span', { class: 'body-s', text: String(value) }),
    ]);
  }

  function toRow(to) {
    const recipients = (Array.isArray(to) ? to : [to]).map((x) => String(x || '').trim()).filter(Boolean);
    if (!recipients.length) return null;
    return el('div', { class: 'evreader__meta' }, [
      el('span', { class: 'caption muted evreader__metalabel', text: 'To' }),
      el('div', { class: 'row gap-1', style: 'flex-wrap:wrap' },
        recipients.map((r) => el('span', { class: 'badge badge--muted', text: r }))),
    ]);
  }

  function attachmentsRow(file, attachments) {
    if (!attachments || !attachments.length) return null;
    return el('div', { class: 'evreader__meta' }, [
      el('span', { class: 'caption muted evreader__metalabel' }, [icon('paperclip'), 'Attachments']),
      el('div', { class: 'row gap-2', style: 'flex-wrap:wrap' },
        attachments.map((att) => {
          const name = att.name || `attachment-${(att.index ?? 0) + 1}`;
          return el('a', {
            class: 'badge badge--info evreader__attach',
            href: source.attachmentUrl(file.rel, att.index ?? 0),
            download: name, title: `Download ${name}`,
          }, [icon('download'), name]);
        })),
    ]);
  }

  function emailCard(file, data) {
    return el('div', { class: 'evreader__email' }, [
      el('h3', { class: 'h4 evreader__subject', text: data.subject || '(no subject)' }),
      el('div', { class: 'evreader__headers' }, [
        metaRow('From', data.from),
        toRow(data.to),
        metaRow('Date', data.date),
        attachmentsRow(file, data.attachments),
      ].filter(Boolean)),
      el('div', { class: 'evreader__body', text: data.body || '(no body)' }),
    ]);
  }

  async function openEmail(file) {
    host.replaceChildren(skeleton());
    let data;
    try {
      data = await source.readMsg(file.rel);
    } catch (err) {
      host.replaceChildren(errNotice('Could not read message', err));
      return;
    }
    host.replaceChildren(emailCard(file, data));
  }

  // ── pdf / image inline ─────────────────────────────────────────────────────
  function openPdf(file) {
    const frame = el('iframe', {
      class: 'evreader__pdf', src: source.fileUrl(file.rel), title: file.name || 'PDF preview',
    });
    host.replaceChildren(el('div', { class: 'evreader__doc' }, [toolbar(file), frame]));
  }

  function openImage(file) {
    const img = el('img', { class: 'evreader__img', src: source.fileUrl(file.rel), alt: file.name || 'image' });
    host.replaceChildren(el('div', { class: 'evreader__doc' }, [toolbar(file), el('div', { class: 'evreader__imgwrap' }, [img])]));
  }

  // ── xlsx / other binary: download only ──────────────────────────────────────
  function openBinary(file) {
    host.replaceChildren(el('div', { class: 'notice' }, [
      icon(fileIconName(file.ext), { size: 24 }),
      el('div', { class: 'h5', text: file.name || file.rel }),
      el('div', { class: 'body-s muted', text: `${fmtBytes(file.bytes)} · this file type can’t be previewed inline.` }),
      el('div', { style: 'margin-top:16px' }, [
        el('a', { class: 'btn btn--primary', href: source.fileUrl(file.rel), download: file.name || '' },
          [icon('download'), 'Download file']),
      ]),
    ]));
  }

  function open(file) {
    if (!file || !file.rel) { clear(); return; }
    const ext = String(file.ext || '').toLowerCase();
    const kind = String(file.kind || '').toLowerCase();
    // Prefer the backend's `kind` when present (batch tree nodes), else the ext.
    if (kind === 'email' || ext === 'msg' || ext === 'eml') return openEmail(file);
    if (kind === 'pdf' || ext === 'pdf') return openPdf(file);
    if (kind === 'image' || IMAGE_EXTS.has(ext)) return openImage(file);
    return openBinary(file);
  }

  clear();
  return { node: host, open, clear };
}
