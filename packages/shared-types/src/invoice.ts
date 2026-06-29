import { z } from 'zod';
import { InvoiceStatusSchema } from './index';

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

export const UpsertInvoiceDraftSchema = z.object({
  invoiceNumber: z.string().min(1).max(100),
  invoiceDate: z.string().min(1),
  poId: z.string().nullable().optional(),
  currency: z.string().length(3).default('SAR'),
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
  createdAt: z.string(),
  updatedAt: z.string(),
  lines: z.array(InvoiceLineSchema),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const InvoiceListItemSchema = InvoiceSchema.omit({ lines: true });
export type InvoiceListItem = z.infer<typeof InvoiceListItemSchema>;

export const InvoiceListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: InvoiceStatusSchema.optional(),
  q: z.string().optional(),
  sort: z.enum(['-createdAt', 'createdAt', '-invoiceDate', 'invoiceDate']).default('-createdAt'),
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

export const UpdateSupplierProfileSchema = z.object({
  legalName: z.string().min(2).max(200).optional(),
  paymentTerms: z.string().max(100).optional(),
  defaultCurrency: z.string().length(3).optional(),
});
export type UpdateSupplierProfile = z.infer<typeof UpdateSupplierProfileSchema>;

export const InviteSupplierUserSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(2).max(200),
  role: z.enum(['SUPPLIER_ADMIN', 'SUPPLIER_USER']).default('SUPPLIER_USER'),
});
export type InviteSupplierUser = z.infer<typeof InviteSupplierUserSchema>;

export const SupplierUserSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: z.enum([
    'SUPPLIER_ADMIN',
    'SUPPLIER_USER',
    'AP_CLERK',
    'AP_APPROVER',
    'PROCUREMENT',
    'TREASURY',
    'VENDOR_MASTER',
    'SYSTEM_ADMIN',
    'AUDITOR',
  ]),
  mfaEnabled: z.boolean(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type SupplierUser = z.infer<typeof SupplierUserSchema>;
