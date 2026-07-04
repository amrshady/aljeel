import { z } from 'zod';

export const DocumentTypeSchema = z.enum([
  'INVOICE',
  'DELIVERY_NOTE',
  'GRN_COPY',
  'CONTRACT',
  'TIMESHEET',
  'ORACLE_UPLOAD',
  'OTHER',
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const ScanStatusSchema = z.enum(['PENDING', 'CLEAN', 'INFECTED', 'FAILED']);
export type ScanStatus = z.infer<typeof ScanStatusSchema>;

/** Common MIME types we can infer from extension when the browser sends octet-stream. */
export const KNOWN_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
  'application/xml',
  'text/xml',
] as const;

/** @deprecated Use size-only validation; any file type is accepted. */
export const ALLOWED_DOCUMENT_MIME_TYPES = KNOWN_DOCUMENT_MIME_TYPES;

/** Keep under Cloudflare Free's 100 MB request-body limit until uploads go direct-to-Spaces. */
export const MAX_DOCUMENT_SIZE_BYTES = 95 * 1024 * 1024;

export const UploadDocumentMetaSchema = z.object({
  type: DocumentTypeSchema.default('INVOICE'),
});
export type UploadDocumentMeta = z.infer<typeof UploadDocumentMetaSchema>;

export const DocumentSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  type: DocumentTypeSchema,
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().optional().nullable(),
  virusScanStatus: ScanStatusSchema,
  createdAt: z.string(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const DocumentListSchema = z.array(DocumentSchema);
export type DocumentList = z.infer<typeof DocumentListSchema>;

/** Presigned URL returned by GET /documents/:id/content when using KB storage. */
export const DocumentContentUrlSchema = z.object({
  url: z.string(),
  mimeType: z.string(),
  fileName: z.string(),
});
export type DocumentContentUrl = z.infer<typeof DocumentContentUrlSchema>;

/** Any MIME type is accepted for invoice attachments. */
export function isAllowedDocumentMimeType(_mimeType: string): boolean {
  return true;
}

const EXTENSION_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  xml: 'application/xml',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain',
  zip: 'application/zip',
};

/** Resolve a stored MIME type from filename + browser hint; unknown types use octet-stream. */
export function resolveDocumentMimeType(fileName: string, mimeType: string): string {
  const normalized = mimeType?.trim().toLowerCase() || '';
  if (normalized && normalized !== 'application/octet-stream') {
    return normalized;
  }
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const fromExt = EXTENSION_MIME[ext];
  if (fromExt) {
    return fromExt;
  }
  return normalized || 'application/octet-stream';
}

export function isAcceptedDocumentFile(
  _fileName: string,
  _mimeType: string,
  sizeBytes: number,
): boolean {
  return sizeBytes <= MAX_DOCUMENT_SIZE_BYTES;
}
