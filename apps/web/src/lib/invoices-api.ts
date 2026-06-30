import {
  CreateInvoiceDraftSchema,
  DocumentListSchema,
  InvoiceDetailSchema,
  InvoiceFolderListItemSchema,
  InvoiceSchema,
  PaginatedResponseSchema,
  SubmitInvoiceResponseSchema,
  UpsertInvoiceDraftSchema,
  ArchiveInvoiceResponseSchema,
  type UpsertInvoiceDraft,
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

export function createInvoiceDraft(invoiceNumber?: string) {
  const payload = CreateInvoiceDraftSchema.parse(
    invoiceNumber ? { invoiceNumber } : {},
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

export function deleteInvoiceDocument(documentId: string) {
  return apiFetch(`/documents/${documentId}`, {
    method: 'DELETE',
    schema: DeletedDocumentSchema,
  });
}
