import { ApiErrorSchema, HealthResponseSchema } from '@aljeel/shared-types';
import { z } from 'zod';

export class ApiClientError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly traceId: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002/api/v1';
}

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { schema: z.ZodType<T>; timeoutMs?: number },
): Promise<T> {
  const { schema, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, ...init } = options;
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && init.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      headers,
      credentials: init.credentials ?? 'include',
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError(
        'TIMEOUT',
        'The server took too long to respond. For large uploads this can take a minute — please wait and try again. If it keeps happening, contact AP support.',
        'unknown',
      );
    }
    throw new ApiClientError(
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
      'unknown',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details, traceId } = parsed.data.error;
      throw new ApiClientError(code, message, traceId, details);
    }
    throw new ApiClientError(
      'UNKNOWN_ERROR',
      `Request failed with status ${response.status}`,
      'unknown',
    );
  }

  const data: unknown = await response.json();
  return schema.parse(data);
}

export function getHealth() {
  return apiFetch('/health', { schema: HealthResponseSchema });
}

async function fetchBinary(
  path: string,
  options: { timeoutMs?: number } = {},
): Promise<{ blob: Blob; fileName?: string }> {
  const headers = new Headers();
  const timeoutMs = options.timeoutMs;
  const controller = timeoutMs ? new AbortController() : undefined;
  const timeout = timeoutMs
    ? setTimeout(() => controller!.abort(), timeoutMs)
    : undefined;

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      headers,
      credentials: 'include',
      redirect: 'follow',
      signal: controller?.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError(
        'TIMEOUT',
        'The download took too long. Try again, or download fewer files.',
        'unknown',
      );
    }
    throw new ApiClientError(
      'NETWORK_ERROR',
      'Could not reach the server. Check your connection and try again.',
      'unknown',
    );
  } finally {
    if (timeout) clearTimeout(timeout);
  }

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, details, traceId } = parsed.data.error;
      throw new ApiClientError(code, message, traceId, details);
    }
    throw new ApiClientError(
      'DOWNLOAD_FAILED',
      `Download failed with status ${response.status}`,
      'unknown',
    );
  }

  const disposition = response.headers.get('content-disposition') ?? '';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const quotedMatch = disposition.match(/filename="([^"]+)"/i);
  const rawName = utf8Match?.[1] ?? quotedMatch?.[1];
  const fileName = rawName ? decodeURIComponent(rawName) : undefined;

  return { blob: await response.blob(), fileName };
}

/** Fetches a binary resource (e.g. a document) as a Blob. */
export async function fetchFile(path: string): Promise<Blob> {
  const { blob } = await fetchBinary(path);
  return blob;
}

/** Fetches a binary resource (e.g. a document) and triggers a browser download. */
export async function downloadFile(
  path: string,
  fileName: string,
  options: { timeoutMs?: number } = {},
): Promise<void> {
  const { blob, fileName: headerName } = await fetchBinary(path, options);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = headerName || fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
