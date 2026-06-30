import { randomUUID } from 'node:crypto';

/** Strip path segments and unsafe chars — same rules as the files-portal worker. */
export function sanitizeKbFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[^\w.\-]+/g, '_').slice(0, 200) || 'file';
}

/**
 * Relative object key under the tenant prefix (no leading current/).
 * Layout: invoices/<invoiceId>/<uuid>-<fileName>
 */
export function invoiceDocumentKey(invoiceId: string, fileName: string): string {
  const safe = sanitizeKbFileName(fileName);
  return `invoices/${invoiceId}/${randomUUID()}-${safe}`;
}

/** Full Spaces key = tenant prefix + relative storage key. */
export function toFullObjectKey(tenantPrefix: string, storageKey: string): string {
  return `${tenantPrefix}${storageKey}`;
}
