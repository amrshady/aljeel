import { z } from 'zod';
import { AsateelRegionSchema } from './asateel-region';

export const SignatureBatchListItemSchema = z.object({
  id: z.string(),
  invoiceNumber: z.string(),
  supplierName: z.string(),
  asateelRegion: AsateelRegionSchema.nullable(),
  stage: z.number().int(),
  invoiceCount: z.number().int(),
  signedCount: z.number().int(),
  updatedAt: z.string(),
});
export type SignatureBatchListItem = z.infer<typeof SignatureBatchListItemSchema>;

export const SignatureBatchListSchema = z.array(SignatureBatchListItemSchema);

const SignatureEvidenceFileSchema = z.object({
  id: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
});

export const SignatureInvoiceRowSchema = z.object({
  invoiceNo: z.string(),
  signedAt: z.string().nullable(),
  files: z.array(SignatureEvidenceFileSchema),
});

export const SignatureBatchDetailSchema = SignatureBatchListItemSchema.extend({
  invoiceDate: z.string(),
  canApproveLines: z.boolean(),
  canApproveBatch: z.boolean(),
  rows: z.array(SignatureInvoiceRowSchema),
});
export type SignatureBatchDetail = z.infer<typeof SignatureBatchDetailSchema>;

export const SignatureLineApprovalSchema = z.object({
  invoiceId: z.string(),
  invoiceNo: z.string(),
  signedAt: z.string().nullable(),
  stage1Complete: z.boolean(),
});
export type SignatureLineApproval = z.infer<typeof SignatureLineApprovalSchema>;

export const SignatureDoneSchema = z.object({
  invoiceId: z.string(),
  stage1Complete: z.boolean(),
});
export type SignatureDone = z.infer<typeof SignatureDoneSchema>;

export const SignatureBatchApprovalSchema = z.object({
  invoiceId: z.string(),
  status: z.literal('UNDER_REVIEW'),
});
export type SignatureBatchApproval = z.infer<typeof SignatureBatchApprovalSchema>;

export const SignatureRejectRequestSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
});
export type SignatureRejectRequest = z.infer<typeof SignatureRejectRequestSchema>;

export const SignatureBatchRejectionSchema = z.object({
  invoiceId: z.string(),
  status: z.literal('CHANGES_REQUESTED'),
});
export type SignatureBatchRejection = z.infer<typeof SignatureBatchRejectionSchema>;
