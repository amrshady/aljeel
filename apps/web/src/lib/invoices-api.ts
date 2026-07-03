import {
  CreateInvoiceDraftSchema,
  DocumentContentUrlSchema,
  DocumentListSchema,
  InvoiceDetailSchema,
  InvoiceFolderListItemSchema,
  InvoiceSchema,
  PaginatedResponseSchema,
  SubmitInvoiceResponseSchema,
  UpsertInvoiceDraftSchema,
  ArchiveInvoiceResponseSchema,
  type UpsertInvoiceDraft,
  type AsateelRegion,
} from '@aljeel/shared-types';
import { z } from 'zod';
import { apiFetch } from './api-client';

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

export function createInvoiceDraft(invoiceNumber?: string, asateelRegion?: AsateelRegion) {
  const payload = CreateInvoiceDraftSchema.parse(
    invoiceNumber || asateelRegion ? { invoiceNumber, asateelRegion } : {},
  );
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

export function submitInvoice(id: string) {
  return apiFetch(`/invoices/${id}/submit`, {
    method: 'POST',
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

export async function getDocumentViewUrl(documentId: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/api/v1';

  const response = await fetch(`${baseUrl}/documents/${documentId}/content`, {
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
      kind: 'remote' as const,
      url: parsed.url,
      mimeType: parsed.mimeType,
      fileName: parsed.fileName,
    };
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  return {
    kind: 'blob' as const,
    blob,
    mimeType: contentType || 'application/octet-stream',
    fileName: match?.[1] ?? 'document',
  };
}

export function deleteInvoiceDocument(documentId: string) {
  return apiFetch(`/documents/${documentId}`, {
    method: 'DELETE',
    schema: DeletedDocumentSchema,
  });
}
