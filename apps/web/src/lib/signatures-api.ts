import {
  SignatureBatchApprovalSchema,
  SignatureBatchDetailSchema,
  SignatureBatchListSchema,
  SignatureBatchRejectionSchema,
  SignatureDoneSchema,
  SignatureLineApprovalSchema,
} from '@aljeel/shared-types';
import { apiFetch } from './api-client';

export function listSignatureBatches() {
  return apiFetch('/signatures', { schema: SignatureBatchListSchema });
}

export function getSignatureBatch(invoiceId: string) {
  return apiFetch(`/signatures/${invoiceId}`, { schema: SignatureBatchDetailSchema });
}

export function approveSignatureLine(invoiceId: string, invoiceNo: string) {
  return apiFetch(`/signatures/${invoiceId}/lines/${encodeURIComponent(invoiceNo)}/approve`, {
    method: 'POST',
    schema: SignatureLineApprovalSchema,
  });
}

export function revokeSignatureLine(invoiceId: string, invoiceNo: string) {
  return apiFetch(`/signatures/${invoiceId}/lines/${encodeURIComponent(invoiceNo)}/revoke`, {
    method: 'POST',
    schema: SignatureLineApprovalSchema,
  });
}

export function finishSignatureBatch(invoiceId: string) {
  return apiFetch(`/signatures/${invoiceId}/done`, {
    method: 'POST',
    schema: SignatureDoneSchema,
  });
}

export function approveSignatureBatch(invoiceId: string) {
  return apiFetch(`/signatures/${invoiceId}/approve`, {
    method: 'POST',
    schema: SignatureBatchApprovalSchema,
  });
}

export function rejectSignatureBatch(invoiceId: string, reason: string) {
  return apiFetch(`/signatures/${invoiceId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
    schema: SignatureBatchRejectionSchema,
  });
}
