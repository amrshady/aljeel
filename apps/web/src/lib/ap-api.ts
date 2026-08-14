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

const SOLVENTUM_OUTPUT_FILE_NAME = 'Chargeback report supported by PODs attached.xlsx';

export async function generateSolventumChargeback(files: File[]): Promise<void> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/api/v1';
  const response = await fetch(`${baseUrl}/ap/solventum/chargeback`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: { message?: string };
    } | null;
    throw new Error(body?.error?.message ?? 'Could not generate the chargeback workbook.');
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = SOLVENTUM_OUTPUT_FILE_NAME;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

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
