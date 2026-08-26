import { normalizeDocumentRelativePath } from '@aljeel/shared-types';

/**
 * Builds a unique zip entry path from a document's logical relative path,
 * preserving folder hierarchy (`folder/file.pdf`).
 */
export function uniqueZipEntryName(fileName: string, used: Set<string>): string {
  const normalized = normalizeDocumentRelativePath(fileName) || 'file';
  let candidate = normalized;
  let n = 1;
  while (used.has(candidate.toLowerCase())) {
    const parts = normalized.split('/');
    const base = parts.pop() ?? 'file';
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    parts.push(`${stem} (${n})${ext}`);
    candidate = parts.join('/');
    n += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Safe ASCII basename for Content-Disposition (invoice number → zip name). */
export function archiveDownloadFileName(invoiceNumber: string): string {
  const safe =
    invoiceNumber
      .replace(/[^\w\-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 80) || 'invoice';
  return `${safe}-documents.zip`;
}
