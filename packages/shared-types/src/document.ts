import { z } from 'zod';

export const DocumentTypeSchema = z.enum([
  'INVOICE',
  'DELIVERY_NOTE',
  'GRN_COPY',
  'CONTRACT',
  'TIMESHEET',
  'OTHER',
]);
export type DocumentType = z.infer<typeof DocumentTypeSchema>;

export const ScanStatusSchema = z.enum(['PENDING', 'CLEAN', 'INFECTED', 'FAILED']);
export type ScanStatus = z.infer<typeof ScanStatusSchema>;

/** Accepted upload formats: PDF, common images, and e-invoice XML. */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/tiff',
  'application/xml',
  'text/xml',
] as const;

export const MAX_DOCUMENT_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

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
  virusScanStatus: ScanStatusSchema,
  createdAt: z.string(),
});
export type Document = z.infer<typeof DocumentSchema>;

export const DocumentListSchema = z.array(DocumentSchema);
export type DocumentList = z.infer<typeof DocumentListSchema>;

export function isAllowedDocumentMimeType(mimeType: string): boolean {
  return (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType);
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
};

/** Browsers (esp. Safari/macOS) often report PDFs as application/octet-stream — infer from extension. */
export function resolveDocumentMimeType(fileName: string, mimeType: string): string {
  const normalized = mimeType?.trim().toLowerCase() || '';
  if (
    normalized &&
    normalized !== 'application/octet-stream' &&
    isAllowedDocumentMimeType(normalized)
  ) {
    return normalized;
  }
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  const fromExt = EXTENSION_MIME[ext];
  if (fromExt) {
    return fromExt;
  }
  return normalized;
}

export function isAcceptedDocumentFile(
  fileName: string,
  mimeType: string,
  sizeBytes: number,
): boolean {
  const resolved = resolveDocumentMimeType(fileName, mimeType);
  return isAllowedDocumentMimeType(resolved) && sizeBytes <= MAX_DOCUMENT_SIZE_BYTES;
}
