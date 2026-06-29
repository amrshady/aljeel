import { ZodError } from 'zod';
import { ApiClientError } from './api-client';

export function formatClientError(err: unknown, fallback: string): string {
  if (err instanceof ApiClientError) {
    const fields = err.details?.fields;
    if (Array.isArray(fields)) {
      const messages = fields
        .map((f) => {
          if (typeof f === 'object' && f !== null && 'message' in f) {
            return String((f as { message: string }).message);
          }
          return String(f);
        })
        .filter(Boolean);
      if (messages.length > 0) {
        return messages.join(' · ');
      }
    }
    return err.message;
  }
  if (err instanceof ZodError) {
    return err.errors.map((e) => e.message).join(' · ');
  }
  if (err instanceof Error && err.message) {
    return err.message;
  }
  return fallback;
}
