import { DocumentTypeSchema } from '@aljeel/shared-types';
import { z } from 'zod';

export const DocumentUploadUrlRequestSchema = z.object({
  fileName: z.string().min(1).max(500),
  sizeBytes: z.number().int().positive(),
  type: DocumentTypeSchema.default('INVOICE'),
});
export type DocumentUploadUrlRequest = z.infer<typeof DocumentUploadUrlRequestSchema>;

export const DocumentUploadUrlResponseSchema = z.object({
  url: z.string().url(),
  storageKey: z.string(),
  expiresIn: z.number().int().positive(),
  headers: z.record(z.string()).optional(),
});
export type DocumentUploadUrlResponse = z.infer<typeof DocumentUploadUrlResponseSchema>;

export const DocumentCompleteUploadSchema = z.object({
  storageKey: z.string().min(1),
  fileName: z.string().min(1).max(500),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  type: DocumentTypeSchema.default('INVOICE'),
});
export type DocumentCompleteUpload = z.infer<typeof DocumentCompleteUploadSchema>;

export type KbUploadPhase = 'signing' | 'uploading' | 'finalizing';

export interface KbUploadProgress {
  loaded: number;
  total: number;
  percent: number;
  phase: KbUploadPhase;
}

export interface KbUploadResult {
  storageKey: string;
}
