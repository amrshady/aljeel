import type { DocumentType } from '@aljeel/shared-types';
import { resolveDocumentMimeType } from '@aljeel/shared-types';
import type { DocumentCompleteUpload, DocumentUploadUrlResponse, KbUploadProgress } from './types';

export interface PresignUploadUrlParams {
  invoiceId: string;
  fileName: string;
  sizeBytes: number;
  type: DocumentType;
}

export interface CompleteUploadParams {
  invoiceId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256?: string;
  type: DocumentType;
}

export interface KbUploadApi {
  requestUploadUrl(params: PresignUploadUrlParams): Promise<DocumentUploadUrlResponse>;
  completeUpload(params: CompleteUploadParams): Promise<unknown>;
}

export async function sha256File(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function report(
  onProgress: ((progress: KbUploadProgress) => void) | undefined,
  phase: KbUploadProgress['phase'],
  loaded: number,
  total: number,
) {
  onProgress?.({
    phase,
    loaded,
    total,
    percent: total > 0 ? Math.floor((loaded / total) * 100) : 0,
  });
}

/**
 * Browser upload: presign via API → direct PUT to Spaces/MinIO → register in API.
 * Same three-step flow as workers/files-portal/site/index.html uploadOne().
 */
export async function uploadFileViaKb(
  api: KbUploadApi,
  invoiceId: string,
  file: File,
  type: DocumentType,
  onProgress?: (progress: KbUploadProgress) => void,
  knownChecksumSha256?: string,
  displayFileName?: string,
): Promise<{ storageKey: string }> {
  const mimeType = resolveDocumentMimeType(file.name, file.type);
  const storedFileName = displayFileName?.trim() || file.name;
  report(onProgress, 'signing', 0, file.size);
  const checksumSha256 = knownChecksumSha256 ?? (await sha256File(file));

  const sign = await api.requestUploadUrl({
    invoiceId,
    fileName: storedFileName,
    sizeBytes: file.size,
    type,
  });

  report(onProgress, 'uploading', 0, file.size);
  await putWithProgress(sign.url, file, sign.headers, (loaded, total) => {
    report(onProgress, 'uploading', loaded, total);
  });

  report(onProgress, 'finalizing', file.size, file.size);
  const complete: DocumentCompleteUpload = {
    storageKey: sign.storageKey,
    fileName: storedFileName,
    mimeType,
    sizeBytes: file.size,
    checksumSha256,
    type,
  };
  await api.completeUpload({ invoiceId, ...complete });

  return { storageKey: sign.storageKey };
}

function putWithProgress(
  url: string,
  file: File,
  headers: Record<string, string> | undefined,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (event: ProgressEvent) => {
      if (!event.lengthComputable || !onProgress) return;
      onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status < 300) {
        resolve();
        return;
      }
      const detail = (xhr.responseText || '').slice(0, 200);
      reject(new Error(`Upload failed (HTTP ${xhr.status}): ${detail}`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.open('PUT', url);
    if (headers) {
      Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    }
    xhr.send(file);
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
