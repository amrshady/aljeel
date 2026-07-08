import { z } from 'zod';
import { InvoiceFolderListItemSchema, InvoiceListQuerySchema, InvoiceSchema } from './invoice';
import {
  AsateelRegionSchema,
  InvoiceStatusSchema,
  ReconRunStatusSchema,
  SupplierErpIntegrationSchema,
} from './index';
import { InvoiceTimelineEventSchema } from './timeline';
import { PaginatedResponseSchema } from './index';

export const ApExceptionInvoiceSchema = InvoiceFolderListItemSchema.extend({
  supplierName: z.string(),
  status: InvoiceStatusSchema,
});
export type ApExceptionInvoice = z.infer<typeof ApExceptionInvoiceSchema>;

export const ApExceptionListSchema = PaginatedResponseSchema(ApExceptionInvoiceSchema);
export type ApExceptionList = z.infer<typeof ApExceptionListSchema>;

export const ApExceptionListQuerySchema = InvoiceListQuerySchema.extend({
  view: z.enum(['queue', 'processed']).default('queue'),
});
export type ApExceptionListQuery = z.infer<typeof ApExceptionListQuerySchema>;

export const ApInvoiceDetailSchema = InvoiceSchema.extend({
  supplierName: z.string(),
  reconciliation: z
    .object({
      vendor: SupplierErpIntegrationSchema.nullable(),
      status: ReconRunStatusSchema.nullable(),
      runId: z.string().nullable(),
      queuePosition: z.number().int().nullable(),
      emailSent: z.boolean().nullable(),
      error: z.string().nullable(),
      region: AsateelRegionSchema.nullable(),
      folderName: z.string().nullable(),
      triggeredAt: z.string().nullable(),
      startedAt: z.string().nullable(),
      finishedAt: z.string().nullable(),
      lastPolledAt: z.string().nullable(),
      outputDocumentId: z.string().nullable(),
      outputFileName: z.string().nullable(),
    })
    .nullable(),
  timeline: z.array(InvoiceTimelineEventSchema),
});
export type ApInvoiceDetail = z.infer<typeof ApInvoiceDetailSchema>;

export const ApReconciliationStatusSchema = ApInvoiceDetailSchema.shape.reconciliation.unwrap();
export type ApReconciliationStatus = z.infer<typeof ApReconciliationStatusSchema>;

export const ApRejectRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type ApRejectRequest = z.infer<typeof ApRejectRequestSchema>;

export const ApHoldRequestSchema = z.object({
  comment: z.string().min(1).max(1000),
});
export type ApHoldRequest = z.infer<typeof ApHoldRequestSchema>;

export const ApActionResponseSchema = z.object({
  id: z.string(),
  status: InvoiceStatusSchema,
});
export type ApActionResponse = z.infer<typeof ApActionResponseSchema>;
