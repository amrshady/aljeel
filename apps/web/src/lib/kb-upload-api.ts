import {
  DocumentSchema,
  resolveDocumentMimeType,
  type DocumentType,
} from '@aljeel/shared-types';
import {
  DocumentUploadUrlResponseSchema,
  uploadFileViaKb,
  type KbUploadApi,
  type KbUploadProgress,
} from '@aljeel/kb-upload';
import { ApiClientError, apiFetch } from './api-client';

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/api/v1';
}

function kbApi(invoiceId: string): KbUploadApi {
  return {
    requestUploadUrl: ({ fileName, sizeBytes, type }) =>
      apiFetch(`/invoices/${invoiceId}/documents/upload-url`, {
        method: 'POST',
        body: JSON.stringify({ fileName, sizeBytes, type }),
        schema: DocumentUploadUrlResponseSchema,
      }),
    completeUpload: (params) =>
      apiFetch(`/invoices/${invoiceId}/documents/complete`, {
        method: 'POST',
        body: JSON.stringify({
          storageKey: params.storageKey,
          fileName: params.fileName,
          mimeType: params.mimeType,
          sizeBytes: params.sizeBytes,
          type: params.type,
        }),
        schema: DocumentSchema,
      }),
  };
}

function uploadInvoiceDocumentMultipart(
  invoiceId: string,
  file: File,
  type: DocumentType = 'OTHER',
  onProgress?: (progress: KbUploadProgress) => void,
): Promise<unknown> {
  const normalizedType = resolveDocumentMimeType(file.name, file.type);
  const normalized =
    normalizedType === file.type
      ? file
      : new File([file], file.name, { type: normalizedType, lastModified: file.lastModified });
  const form = new FormData();
  form.append('file', normalized);
  form.append('type', type);

  onProgress?.({ phase: 'signing', loaded: 0, total: file.size, percent: 0 });
  onProgress?.({ phase: 'uploading', loaded: 0, total: file.size, percent: 0 });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({
        phase: 'uploading',
        loaded: event.loaded,
        total: event.total,
        percent: Math.floor((event.loaded / event.total) * 100),
      });
    };
    xhr.onload = () => {
      if (xhr.status < 300) {
        onProgress?.({ phase: 'finalizing', loaded: file.size, total: file.size, percent: 100 });
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(DocumentSchema.parse(data));
        } catch {
          reject(new Error('Invalid upload response'));
        }
        return;
      }
      let code = 'UNKNOWN_ERROR';
      let message = `Upload failed (HTTP ${xhr.status})`;
      try {
        const body = JSON.parse(xhr.responseText) as { error?: { code?: string; message?: string } };
        if (body.error?.code) code = body.error.code;
        if (body.error?.message) message = body.error.message;
      } catch {
        // ignore parse errors
      }
      reject(new ApiClientError(code, message, 'unknown'));
    };
    xhr.onerror = () => reject(new ApiClientError('NETWORK_ERROR', 'Network error during upload', 'unknown'));
    xhr.open('POST', `${getBaseUrl()}/invoices/${invoiceId}/documents`);
    xhr.withCredentials = true;
    xhr.send(form);
  });
}

/**
 * Upload via KB presigned URL (Spaces/MinIO) when configured; otherwise multipart to API.
 */
export async function uploadInvoiceDocumentViaKb(
  invoiceId: string,
  file: File,
  type: DocumentType = 'OTHER',
  onProgress?: (progress: KbUploadProgress) => void,
) {
  try {
    return await uploadFileViaKb(kbApi(invoiceId), invoiceId, file, type, onProgress);
  } catch (err) {
    if (err instanceof ApiClientError && err.code === 'KB_UPLOAD_NOT_CONFIGURED') {
      await uploadInvoiceDocumentMultipart(invoiceId, file, type, onProgress);
      return { storageKey: 'local' };
    }
    throw err;
  }
}

export type { KbUploadProgress };
