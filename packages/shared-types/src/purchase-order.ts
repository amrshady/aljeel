import { z } from 'zod';
import { PaginatedResponseSchema } from './index';

const decimalString = z.string();

export const PoLineSchema = z.object({
  id: z.string(),
  description: z.string(),
  qty: decimalString,
  unitPrice: decimalString,
  vatRate: decimalString,
});
export type PoLine = z.infer<typeof PoLineSchema>;

export const GoodsReceiptSchema = z.object({
  id: z.string(),
  receivedQty: decimalString,
  receivedAt: z.string(),
});
export type GoodsReceipt = z.infer<typeof GoodsReceiptSchema>;

export const PurchaseOrderListItemSchema = z.object({
  id: z.string(),
  supplierId: z.string(),
  poNumber: z.string(),
  status: z.string(),
  currency: z.string(),
  erpPoId: z.string().nullable(),
  lineCount: z.number().int().nonnegative(),
  createdAt: z.string(),
});
export type PurchaseOrderListItem = z.infer<typeof PurchaseOrderListItemSchema>;

export const PurchaseOrderDetailSchema = PurchaseOrderListItemSchema.omit({
  lineCount: true,
}).extend({
  lines: z.array(PoLineSchema),
  receipts: z.array(GoodsReceiptSchema),
});
export type PurchaseOrderDetail = z.infer<typeof PurchaseOrderDetailSchema>;

export const PurchaseOrderListQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.string().optional(),
  q: z.string().optional(),
});
export type PurchaseOrderListQuery = z.infer<typeof PurchaseOrderListQuerySchema>;

export const PurchaseOrderListSchema = PaginatedResponseSchema(PurchaseOrderListItemSchema);
