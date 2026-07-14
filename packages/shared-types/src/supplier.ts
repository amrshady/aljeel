import { z } from 'zod';
import { SupplierErpIntegrationSchema, SupplierStatusSchema } from './index';

export const SupplierProfileSchema = z.object({
  id: z.string(),
  legalName: z.string(),
  crNumber: z.string().nullable(),
  vatNumber: z.string().nullable(),
  status: SupplierStatusSchema,
  paymentTerms: z.string().nullable(),
  defaultCurrency: z.string(),
  erpVendorId: z.string().nullable(),
  erpIntegration: SupplierErpIntegrationSchema.nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SupplierProfile = z.infer<typeof SupplierProfileSchema>;

export const InvoicePipelineCountsSchema = z.object({
  draft: z.number().int().nonnegative(),
  submitted: z.number().int().nonnegative(),
  underReview: z.number().int().nonnegative(),
  approved: z.number().int().nonnegative(),
  scheduled: z.number().int().nonnegative(),
  paid: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  onHold: z.number().int().nonnegative(),
});
export type InvoicePipelineCounts = z.infer<typeof InvoicePipelineCountsSchema>;
