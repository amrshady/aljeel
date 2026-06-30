import { z } from 'zod';
import { InvoiceFolderListItemSchema, InvoiceSchema } from './invoice';
import { InvoiceStatusSchema } from './index';
import { InvoiceTimelineEventSchema } from './timeline';
import { PaginatedResponseSchema } from './index';

export const ApExceptionInvoiceSchema = InvoiceFolderListItemSchema.extend({
  supplierName: z.string(),
});
export type ApExceptionInvoice = z.infer<typeof ApExceptionInvoiceSchema>;

export const ApExceptionListSchema = PaginatedResponseSchema(ApExceptionInvoiceSchema);
export type ApExceptionList = z.infer<typeof ApExceptionListSchema>;

export const ApInvoiceDetailSchema = InvoiceSchema.extend({
  supplierName: z.string(),
  timeline: z.array(InvoiceTimelineEventSchema),
});
export type ApInvoiceDetail = z.infer<typeof ApInvoiceDetailSchema>;

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
