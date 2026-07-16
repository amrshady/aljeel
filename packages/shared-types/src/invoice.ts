import { z } from 'zod';
import { AsateelRegionSchema, InvoiceStatusSchema } from './index';

const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, 'Must be a valid decimal');

export const InvoiceLineInputSchema = z.object({
  description: z.string().min(1).max(500),
  qty: decimalString,
  unitPrice: decimalString,
  vatRate: decimalString.default('15'),
  glCode: z.string().max(50).optional(),
  costCenter: z.string().max(50).optional(),
});
export type InvoiceLineInput = z.infer<typeof InvoiceLineInputSchema>;

export const InvoiceLineSchema = InvoiceLineInputSchema.extend({
  id: z.string(),
  amount: z.string(),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

/** Optional display name; server generates a placeholder when omitted. */
export const CreateInvoiceDraftSchema = z
  .object({
    invoiceNumber: z.string().trim().min(1).max(100).optional(),
    asateelRegion: AsateelRegionSchema.optional(),
  })
  .strict();
export type CreateInvoiceDraft = z.infer<typeof CreateInvoiceDraftSchema>;

/** Set Asateel region on an editable draft before submit. */
export const UpdateAsateelRegionSchema = z
  .object({
    asateelRegion: AsateelRegionSchema,
  })
  .strict();
export type UpdateAsateelRegion = z.infer<typeof UpdateAsateelRegionSchema>;

export const PLACEHOLDER_INVOICE_NUMBER_PREFIX = 'DRAFT-';

export function isPlaceholderInvoiceNumber(invoiceNumber: string): boolean {
  return invoiceNumber.startsWith(PLACEHOLDER_INVOICE_NUMBER_PREFIX);
}

export const UpsertInvoiceDraftSchema = z.object({
  invoiceNumber: z.string().min(1).max(100),
  invoiceDate: z.string().min(1),
  poId: z.string().nullable().optional(),
  currency: z.string().length(3).default('SAR'),
  asateelRegion: AsateelRegionSchema.optional().nullable(),
  lines: z.array(InvoiceLineInputSchema).min(1),
});
export type UpsertInvoiceDraft = z.infer<typeof UpsertInvoiceDraftSchema>;

export const InvoiceSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  invoiceNumber: z.string(),
  invoiceDate: z.string(),
  poId: z.string().nullable(),
  currency: z.string(),
  subtotal: z.string(),
  vat: z.string(),
  total: z.string(),
  status: InvoiceStatusSchema,
  source: z.enum(['UPLOAD', 'EMAIL', 'XML', 'BULK']),
  rejectionReason: z.string().nullable(),
  archivedAt: z.string().nullable(),
  asateelRegion: AsateelRegionSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(InvoiceLineSchema),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const InvoiceListItemSchema = InvoiceSchema.omit({ lines: true });
export type InvoiceListItem = z.infer<typeof InvoiceListItemSchema>;

export const InvoiceFolderListItemSchema = InvoiceListItemSchema.extend({
  documentCount: z.number().int(),
  totalSizeBytes: z.number().int(),
});
export type InvoiceFolderListItem = z.infer<typeof InvoiceFolderListItemSchema>;

export const ArchiveInvoiceResponseSchema = z.object({
  id: z.string(),
  archivedAt: z.string(),
});
export type ArchiveInvoiceResponse = z.infer<typeof ArchiveInvoiceResponseSchema>;

export const InvoiceListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: InvoiceStatusSchema.optional(),
  archived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
  q: z.string().optional(),
  sort: z
    .enum(['-createdAt', 'createdAt', '-updatedAt', 'updatedAt', '-invoiceDate', 'invoiceDate'])
    .default('-updatedAt'),
});
export type InvoiceListQuery = z.infer<typeof InvoiceListQuerySchema>;

export const SubmitInvoiceResponseSchema = z.object({
  id: z.string(),
  status: InvoiceStatusSchema,
  matchResult: z
    .object({
      type: z.literal('MANUAL_REVIEW'),
      withinTolerance: z.literal(false),
    })
    .optional(),
});
export type SubmitInvoiceResponse = z.infer<typeof SubmitInvoiceResponseSchema>;
