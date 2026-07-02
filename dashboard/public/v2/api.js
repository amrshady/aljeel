// ============================================================================
// api.js — typed wrappers for every /api/v2/* endpoint.
//
// Shapes mirror scripts/droplet_api_v2.py exactly. The Worker maps
// /api/v2/*  →  droplet /v2/*  (it strips the /api prefix).
//
// JSON calls go through apiFetch (defined in app.js: handles errors + the
// Cloudflare Access redirect). Binary endpoints (downloads, inline files,
// attachments) are exposed as URL builders so the browser fetches them
// natively — carrying the Access cookie and honoring Content-Disposition.
// ============================================================================

import { apiFetch } from './app.js';

export const API_BASE = '/api/v2';

const enc = encodeURIComponent;

// ── Health ──────────────────────────────────────────────────────────────────
// GET /v2/ping → {ok:true}
export const ping = () => apiFetch('/ping');

// ── Batches ─────────────────────────────────────────────────────────────────
// GET /v2/batches
// → {batches:[{batch_id, evidence_root, item_count,
//              last_run:{run_id,state,ended_at,flagged_rows,sar_at_risk}|null}]}
export const listBatches = () => apiFetch('/batches');

// ── Run history ─────────────────────────────────────────────────────────────
// GET /v2/batches/<batch>/runs?limit=50
// → {batch_id, runs:[{run_id,state,trigger,created_at,started_at,ended_at,
//      duration_sec,total_rows,flagged_rows,sar_at_risk,hard_count,
//      has_report,has_split}]}   (newest-first)
export const listRuns = (batchId, limit = 50) =>
  apiFetch(`/batches/${enc(batchId)}/runs?limit=${enc(limit)}`);

// ── Trigger run / re-run ─────────────────────────────────────────────────────
// POST /v2/batches/<batch>/runs
// body {no_cache?:bool, invoice_path?:string|null, trigger?:'manual'|'rerun'}
// → 202 {run_id,state:'QUEUED'}  |  409 {error:'run_in_progress', active_run_id}
export const triggerRun = (batchId, { no_cache = false, invoice_path = null, trigger = 'manual' } = {}) =>
  apiFetch(`/batches/${enc(batchId)}/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ no_cache, invoice_path, trigger }),
  });

// ── Run state (the poll target — replaces SSE for completion) ────────────────
// GET /v2/runs/<run_id>
// → {run_id,batch_id,state,trigger,stage,stage_index,stage_total,
//    created_at,started_at,ended_at,heartbeat_at,stalled,duration_sec,
//    summary:{total_rows,flagged_rows,sar_at_risk,hard_count},
//    artifacts:{split,report,summary,evidence_snapshot}, failure_reason}
export const getRun = (runId) => apiFetch(`/runs/${enc(runId)}`);

// ── Download — SPLIT only ─────────────────────────────────────────────────────
// GET /v2/runs/<run_id>/download → binary (Content-Disposition: attachment)
export const downloadUrl = (runId) => `${API_BASE}/runs/${enc(runId)}/download`;

// ── Evidence ──────────────────────────────────────────────────────────────────
// GET /v2/runs/<run_id>/evidence/tree → {run_id,evidence_root,folders:[...]}
export const evidenceTree = (runId) => apiFetch(`/runs/${enc(runId)}/evidence/tree`);

// GET /v2/runs/<run_id>/evidence/file?rel=<relpath>
// .msg/.eml → JSON {type,subject,from,to,date,body,attachments}; else binary.
export const evidenceFileJson = (runId, rel) =>
  apiFetch(`/runs/${enc(runId)}/evidence/file?rel=${enc(rel)}`);
export const evidenceFileUrl = (runId, rel) =>
  `${API_BASE}/runs/${enc(runId)}/evidence/file?rel=${enc(rel)}`;

// GET /v2/runs/<run_id>/evidence/msg-attachment?rel=<relpath>&attachment=<idx> → binary
export const msgAttachmentUrl = (runId, rel, attachment = 0) =>
  `${API_BASE}/runs/${enc(runId)}/evidence/msg-attachment?rel=${enc(rel)}&attachment=${enc(attachment)}`;

// ── Batch-level evidence (browse anytime, independent of run state) ────────────
// These hit the batch's evidence root directly, so the folder tree is visible
// even mid-run or with zero runs. The Worker proxies /api/v2/* → droplet /v2/*.
//
// GET /v2/batches/<batch>/evidence/tree?path=<rel>
//   → directory listing for <rel> ('' = root). Tolerant of shape: the browser
//     normalises whichever of {nodes|children|entries|[]} (or flat folders+files)
//     the backend returns. Node: {name, rel, type:'dir'|'file', size, ext,
//     kind:'pdf'|'email'|'image'|'other'}.
export const batchEvidenceTree = (batchId, path = '') =>
  apiFetch(`/batches/${enc(batchId)}/evidence/tree?path=${enc(path)}`);

// GET /v2/batches/<batch>/evidence/file?path=<rel> → inline PDF/image (binary).
export const batchEvidenceFileUrl = (batchId, path) =>
  `${API_BASE}/batches/${enc(batchId)}/evidence/file?path=${enc(path)}`;

// GET /v2/batches/<batch>/evidence/msg?path=<rel>
//   → parsed email JSON {subject, from, to, date, body, attachments:[{index,name}]}.
export const batchEvidenceMsg = (batchId, path) =>
  apiFetch(`/batches/${enc(batchId)}/evidence/msg?path=${enc(path)}`);

// GET /v2/batches/<batch>/evidence/msg-attachment?path=<rel>&attachment=<idx> → binary.
export const batchMsgAttachmentUrl = (batchId, path, attachment = 0) =>
  `${API_BASE}/batches/${enc(batchId)}/evidence/msg-attachment?path=${enc(path)}&attachment=${enc(attachment)}`;

// ── Report — Risk & Inconsistencies ──────────────────────────────────────────
// GET /v2/runs/<run_id>/report?format=json → rendered payload
export const reportJson = (runId) => apiFetch(`/runs/${enc(runId)}/report?format=json`);
// GET …?format=xlsx | md → file download
export const reportXlsxUrl = (runId) => `${API_BASE}/runs/${enc(runId)}/report?format=xlsx`;
export const reportMdUrl   = (runId) => `${API_BASE}/runs/${enc(runId)}/report?format=md`;
// POST /v2/runs/<run_id>/report → {run_id,state:'ready',generated_at}
export const generateReport = (runId) => apiFetch(`/runs/${enc(runId)}/report`, { method: 'POST' });

// ── Per-run logs (separate view; byte-offset paged, NOT SSE) ──────────────────
// GET /v2/runs/<run_id>/log?offset=<bytes>
// → {run_id,offset,next_offset,eof,lines:[{ts,text}]}
export const runLog = (runId, offset = 0) =>
  apiFetch(`/runs/${enc(runId)}/log?offset=${enc(offset)}`);

// ── Operator ──────────────────────────────────────────────────────────────────
// POST /v2/runs/<run_id>/cancel → {run_id,state:'CANCELLED'}
export const cancelRun = (runId) => apiFetch(`/runs/${enc(runId)}/cancel`, { method: 'POST' });
// POST /v2/maintenance/reap → {reaped:[...]}
export const reap = () => apiFetch('/maintenance/reap', { method: 'POST' });
