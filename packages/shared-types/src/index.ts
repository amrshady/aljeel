import { z } from 'zod';

export const SupplierStatusSchema = z.enum([
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'REJECTED',
]);
export type SupplierStatus = z.infer<typeof SupplierStatusSchema>;

export const UserRoleSchema = z.enum([
  'SUPPLIER_ADMIN',
  'SUPPLIER_USER',
  'AP_CLERK',
  'AP_APPROVER',
  'PROCUREMENT',
  'TREASURY',
  'VENDOR_MASTER',
  'SYSTEM_ADMIN',
  'AUDITOR',
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const InvoiceStatusSchema = z.enum([
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'ON_HOLD',
  'REJECTED',
  'SCHEDULED',
  'PAID',
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const AsateelRegionSchema = z.enum(['CENTRAL', 'PROJECTS', 'ADMIN']);
export type AsateelRegion = z.infer<typeof AsateelRegionSchema>;

export const AsateelRunStatusSchema = z.enum([
  'QUEUED',
  'RUNNING',
  'DONE',
  'FAILED',
  'STATUS_LOST',
]);
export type AsateelRunStatus = z.infer<typeof AsateelRunStatusSchema>;

export const VerificationStatusSchema = z.enum(['PENDING', 'VERIFIED', 'REJECTED']);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    traceId: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  timestamp: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
});
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    data: z.array(itemSchema),
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  });

export * from './queue';
export * from './auth';
export * from './supplier';
export * from './invoice';
export * from './invoice-fsm';
export * from './invoice-math';
export * from './document';
export * from './timeline';
export * from './ap';

export const AuthMeResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  fullName: z.string(),
  role: UserRoleSchema,
  supplierId: z.string().nullable(),
});
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
