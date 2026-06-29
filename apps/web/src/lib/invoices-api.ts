import {
  CreateInvoiceDraftSchema,
  DocumentListSchema,
  DocumentSchema,
  InvoiceDetailSchema,
  InvoiceListItemSchema,
  InvoiceSchema,
  PaginatedResponseSchema,
  resolveDocumentMimeType,
  SubmitInvoiceResponseSchema,
  UpsertInvoiceDraftSchema,
  type DocumentType,
  type UpsertInvoiceDraft,
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
    schema: PaginatedResponseSchema(InvoiceListItemSchema),
  });
}

export function getInvoice(id: string) {
  return apiFetch(`/invoices/${id}`, { schema: InvoiceDetailSchema });
}

export function createInvoiceDraft() {
  const payload = CreateInvoiceDraftSchema.parse({});
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

export function listInvoiceDocuments(invoiceId: string) {
  return apiFetch(`/invoices/${invoiceId}/documents`, {
    schema: DocumentListSchema,
  });
}

export function normalizeUploadFile(file: File): File {
  const type = resolveDocumentMimeType(file.name, file.type);
  if (type === file.type) {
    return file;
  }
  return new File([file], file.name, { type, lastModified: file.lastModified });
}

export function uploadInvoiceDocument(
  invoiceId: string,
  file: File,
  type: DocumentType = 'INVOICE',
) {
  const normalized = normalizeUploadFile(file);
  const form = new FormData();
  form.append('file', normalized);
  form.append('type', type);
  return apiFetch(`/invoices/${invoiceId}/documents`, {
    method: 'POST',
    body: form,
    schema: DocumentSchema,
  });
}

export function deleteInvoiceDocument(documentId: string) {
  return apiFetch(`/documents/${documentId}`, {
    method: 'DELETE',
    schema: DeletedDocumentSchema,
  });
}

export function downloadInvoiceDocument(documentId: string, fileName: string) {
  return downloadFile(`/documents/${documentId}/download`, fileName);
}
