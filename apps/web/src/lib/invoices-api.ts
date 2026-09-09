import {
  CreateInvoiceDraftSchema,
  DocumentContentUrlSchema,
  DocumentListSchema,
  DocumentSchema,
  EmailPreviewSchema,
  InvoiceDetailSchema,
  InvoiceFolderListItemSchema,
  InvoiceSchema,
  PaginatedResponseSchema,
  SubmitInvoiceResponseSchema,
  UpsertInvoiceDraftSchema,
  UpdateAsateelRegionSchema,
  ArchiveInvoiceResponseSchema,
  type UpsertInvoiceDraft,
  type AsateelRegion,
  type SupplierErpIntegration,
} from '@aljeel/shared-types';
import { z } from 'zod';
import { apiFetch, downloadFile } from './api-client';

const DeletedDocumentSchema = z.object({
  id: z.string(),
  deleted: z.boolean(),
});

export function listInvoices(params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const qs = search.toString();
  return apiFetch(`/invoices${qs ? `?${qs}` : ''}`, {
    schema: PaginatedResponseSchema(InvoiceFolderListItemSchema),
  });
}

export function getInvoice(id: string) {
  return apiFetch(`/invoices/${id}`, { schema: InvoiceDetailSchema });
}

export function createInvoiceDraft(
  invoiceNumber?: string,
  asateelRegion?: AsateelRegion,
  erpIntegration?: SupplierErpIntegration,
) {
  const payload = CreateInvoiceDraftSchema.parse({
    ...(invoiceNumber ? { invoiceNumber } : {}),
    ...(asateelRegion ? { asateelRegion } : {}),
    ...(erpIntegration ? { erpIntegration } : {}),
  });
  return apiFetch('/invoices', {
    method: 'POST',
    body: JSON.stringify(payload),
    schema: InvoiceSchema,
  });
}

export function updateInvoiceDraft(id: string, body: UpsertInvoiceDraft) {
  const payload = UpsertInvoiceDraftSchema.parse(body);
  return apiFetch(`/invoices/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
    schema: InvoiceSchema,
  });
}

export function updateInvoiceAsateelRegion(id: string, asateelRegion: AsateelRegion) {
  const payload = UpdateAsateelRegionSchema.parse({ asateelRegion });
  return apiFetch(`/invoices/${id}/asateel-region`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    schema: InvoiceSchema,
  });
}

export function submitInvoice(id: string) {
  return apiFetch(`/invoices/${id}/submit`, {
    method: 'POST',
    timeoutMs: 120_000,
    schema: SubmitInvoiceResponseSchema,
  });
}

export function archiveInvoice(id: string) {
  return apiFetch(`/invoices/${id}/archive`, {
    method: 'POST',
    schema: ArchiveInvoiceResponseSchema,
  });
}

export function listInvoiceDocuments(invoiceId: string) {
  return apiFetch(`/invoices/${invoiceId}/documents`, {
    schema: DocumentListSchema,
  });
}

/** Downloads all invoice documents as a zip that preserves folder paths. */
export function downloadInvoiceDocumentsArchive(
  invoiceId: string,
  fileName = 'documents.zip',
) {
  return downloadFile(`/invoices/${invoiceId}/documents/archive`, fileName, {
    // Large evidence packs can take a few minutes to zip from object storage.
    timeoutMs: 5 * 60_000,
  });
}

export type DocumentView =
  | {
      kind: 'remote';
      url: string;
      mimeType: string;
      fileName: string;
    }
  | {
      kind: 'blob';
      blob: Blob;
      mimeType: string;
      fileName: string;
    };

export async function getDocumentViewUrl(
  documentId: string,
  options: { proxy?: boolean } = {},
): Promise<DocumentView> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/api/v1';
  const qs = options.proxy ? '?proxy=1' : '';

  const response = await fetch(`${baseUrl}/documents/${documentId}/content${qs}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    throw new Error('Could not load document');
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const data: unknown = await response.json();
    const parsed = DocumentContentUrlSchema.parse(data);
    return {
      kind: 'remote',
      url: parsed.url,
      mimeType: parsed.mimeType,
      fileName: parsed.fileName,
    };
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  return {
    kind: 'blob',
    blob,
    mimeType: contentType || 'application/octet-stream',
    fileName: match?.[1] ?? 'document',
  };
}

/** Parses a stored .msg/.eml into a renderable email; 422s when it is not an email. */
export function getDocumentEmailPreview(documentId: string) {
  return apiFetch(`/documents/${documentId}/email`, {
    schema: EmailPreviewSchema,
    timeoutMs: 60_000,
  });
}

export function downloadInvoiceDocument(documentId: string, fileName: string) {
  const baseName = fileName.split(/[\\/]/).pop() || fileName;
  return downloadFile(`/documents/${documentId}/download`, baseName);
}

export function downloadEmailAttachment(
  documentId: string,
  index: number,
  fileName: string,
) {
  return downloadFile(
    `/documents/${documentId}/email/attachments/${index}`,
    fileName,
  );
}

export function deleteInvoiceDocument(documentId: string) {
  return apiFetch(`/documents/${documentId}`, {
    method: 'DELETE',
    schema: DeletedDocumentSchema,
  });
}

export function renameInvoiceDocument(documentId: string, fileName: string) {
  return apiFetch(`/documents/${documentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ fileName }),
    schema: DocumentSchema,
  });
}
