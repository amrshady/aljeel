import {
  ApActionResponseSchema,
  ApExceptionListSchema,
  ApHoldRequestSchema,
  ApInvoiceDetailSchema,
  ApReconciliationStatusSchema,
  ApRejectRequestSchema,
  ApRenameInvoiceFolderResponseSchema,
  ApRenameInvoiceFolderSchema,
} from '@aljeel/shared-types';
import { apiFetch } from './api-client';

export function listApExceptions(params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const qs = search.toString();
  return apiFetch(`/ap/exceptions${qs ? `?${qs}` : ''}`, {
    schema: ApExceptionListSchema,
  });
}

export function getApInvoice(id: string) {
  return apiFetch(`/ap/invoices/${id}`, { schema: ApInvoiceDetailSchema });
}

export function getApReconciliationStatus(id: string) {
  return apiFetch(`/ap/invoices/${id}/reconciliation`, {
    schema: ApReconciliationStatusSchema,
  });
}

export function approveInvoice(id: string) {
  return apiFetch(`/ap/invoices/${id}/approve`, {
    method: 'POST',
    schema: ApActionResponseSchema,
  });
}

export function rejectInvoice(id: string, reason: string) {
  const body = ApRejectRequestSchema.parse({ reason });
  return apiFetch(`/ap/invoices/${id}/reject`, {
    method: 'POST',
    body: JSON.stringify(body),
    schema: ApActionResponseSchema,
  });
}

export function holdInvoice(id: string, comment: string) {
  const body = ApHoldRequestSchema.parse({ comment });
  return apiFetch(`/ap/invoices/${id}/hold`, {
    method: 'POST',
    body: JSON.stringify(body),
    schema: ApActionResponseSchema,
  });
}

export function resumeInvoiceReview(id: string) {
  return apiFetch(`/ap/invoices/${id}/resume`, {
    method: 'POST',
    schema: ApActionResponseSchema,
  });
}

export function rerunApReconciliation(id: string) {
  return apiFetch(`/ap/invoices/${id}/reconciliation/rerun`, {
    method: 'POST',
    schema: ApReconciliationStatusSchema,
  });
}

export function renameApInvoiceFolder(id: string, invoiceNumber: string) {
  const body = ApRenameInvoiceFolderSchema.parse({ invoiceNumber });
  return apiFetch(`/ap/invoices/${id}/folder-name`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    schema: ApRenameInvoiceFolderResponseSchema,
  });
}
