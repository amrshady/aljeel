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

const REQUEST_TIMEOUT_MS = 15_000;

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { schema: z.ZodType<T> },
): Promise<T> {
  const { schema, ...init } = options;
  const headers = new Headers(init.headers);
  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && init.body && !isFormData) {
    headers.set('Content-Type', 'application/json');
  }

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${getBaseUrl()}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError(
        'TIMEOUT',
        'API request timed out. Is the API running on port 3002?',
        'unknown',
      );
    }
    throw new ApiClientError(
      'NETWORK_ERROR',
      'Cannot reach the API. Run `pnpm dev` and ensure port 3002 is free.',
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

async function fetchBinary(path: string): Promise<Blob> {
  const headers = new Headers();
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${getBaseUrl()}${path}`, {
    headers,
    redirect: 'follow',
  });
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

  return response.blob();
}

/** Fetches a binary resource (e.g. a document) as a Blob. */
export function fetchFile(path: string): Promise<Blob> {
  return fetchBinary(path);
}

/** Fetches a binary resource (e.g. a document) and triggers a browser download. */
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const blob = await fetchBinary(path);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
