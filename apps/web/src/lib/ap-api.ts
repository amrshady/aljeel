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
const SOLVENTUM_POLLING_TIMEOUT_MS = 30 * 60 * 1000;
const SUPPLIER_RECON_OUTPUT_FILE_NAME = 'Payment details.xlsx';

export interface SolventumChargebackResult {
  failedPodCount: number;
  failedPodNames: string[];
}

export type SolventumJobPhase = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

type SolventumJobStatus = {
  jobId: string;
  status: SolventumJobPhase;
  podCount: number;
  failedPodCount?: number;
  failedPodNames?: string[];
  error?: string;
};

function isSolventumWorkbook(file: File) {
  return /\.xlsx?$/i.test(file.name);
}

function isSolventumPdf(file: File) {
  return /\.pdf$/i.test(file.name);
}

export function validateSolventumFiles(files: File[]): string | null {
  const workbooks = files.filter(isSolventumWorkbook);
  const unsupported = files.filter((file) => !isSolventumWorkbook(file) && !isSolventumPdf(file));
  if (workbooks.length === 0) return 'Add exactly one Excel workbook (.xlsx or .xls).';
  if (workbooks.length > 1)
    return `Remove extra workbook${workbooks.length > 2 ? 's' : ''}: ${workbooks
      .slice(1)
      .map((file) => file.name)
      .join(', ')}`;
  if (unsupported.length > 0)
    return `Unsupported files: ${unsupported.map((file) => file.name).join(', ')}`;
  if (!files.some(isSolventumPdf)) return 'Add at least one POD PDF.';
  return null;
}

function isCreatedSolventumJob(value: unknown): value is { jobId: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'jobId' in value &&
    typeof value.jobId === 'string' &&
    value.jobId.length > 0
  );
}

async function solventumError(response: Response, fallback: string) {
  const responseText = await response.text().catch(() => '');
  const body = (() => {
    try {
      return JSON.parse(responseText) as {
        error?: { message?: string } | string;
        message?: string | string[];
      };
    } catch {
      return null;
    }
  })();
  const nestedMessage = typeof body?.error === 'object' ? body.error.message : body?.error;
  const message = Array.isArray(body?.message)
    ? body.message.join(', ')
    : nestedMessage || body?.message || responseText;
  return new Error(message || `${fallback} (HTTP ${response.status})`);
}

export async function generateSolventumChargeback(
  files: File[],
  onProgress?: (phase: SolventumJobPhase) => void,
): Promise<SolventumChargebackResult> {
  const validationError = validateSolventumFiles(files);
  if (validationError) throw new Error(validationError);
  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/api/v1';
  const response = await fetch(`${baseUrl}/ap/solventum/chargeback/jobs`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!response.ok) {
    throw await solventumError(response, 'Could not start chargeback generation.');
  }
  const created = (await response.json().catch(() => null)) as unknown;
  if (!isCreatedSolventumJob(created)) {
    throw new Error('The server did not return a chargeback job ID.');
  }
  const deadline = Date.now() + SOLVENTUM_POLLING_TIMEOUT_MS;
  let status: SolventumJobStatus;
  onProgress?.('PENDING');
  while (true) {
    if (Date.now() >= deadline) throw new Error('Chargeback generation timed out.');
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const poll = await fetch(
      `${baseUrl}/ap/solventum/chargeback/jobs/${encodeURIComponent(created.jobId)}`,
      { credentials: 'include' },
    );
    if (!poll.ok) throw await solventumError(poll, 'Could not check chargeback generation status.');
    status = (await poll.json()) as SolventumJobStatus;
    onProgress?.(status.status);
    if (status.status === 'FAILED')
      throw new Error(status.error || 'Could not generate the chargeback workbook.');
    if (status.status === 'COMPLETED') break;
  }
  const result = await fetch(
    `${baseUrl}/ap/solventum/chargeback/jobs/${encodeURIComponent(created.jobId)}/result`,
    { credentials: 'include' },
  );
  if (!result.ok) throw await solventumError(result, 'Could not download the chargeback workbook.');
  downloadBlob(await result.blob(), SOLVENTUM_OUTPUT_FILE_NAME);
  return {
    failedPodCount: status.failedPodCount ?? 0,
    failedPodNames: status.failedPodNames ?? [],
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function fileNameFromDisposition(header: string | null, fallback: string): string {
  const utf = header?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (utf) return decodeURIComponent(utf);
  const quoted = header?.match(/filename="([^"]+)"/i)?.[1];
  return quoted || fallback;
}

export async function generateSupplierReconciliation(files: File[]): Promise<void> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file, file.name));
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/api/v1';
  const response = await fetch(`${baseUrl}/ap/supplier-reconciliation`, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });
  if (!response.ok) {
    throw await solventumError(response, 'Could not run supplier reconciliation.');
  }
  downloadBlob(
    await response.blob(),
    fileNameFromDisposition(
      response.headers.get('Content-Disposition'),
      SUPPLIER_RECON_OUTPUT_FILE_NAME,
    ),
  );
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
