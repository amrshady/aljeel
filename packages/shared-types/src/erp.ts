import { z } from 'zod';

const decimalString = z
  .string()
  .regex(/^-?\d+(\.\d{1,4})?$/, 'Must be a valid decimal');

export const ErpPoLineSchema = z.object({
  description: z.string(),
  qty: decimalString,
  unitPrice: decimalString,
  vatRate: decimalString.default('15'),
});
export type ErpPoLine = z.infer<typeof ErpPoLineSchema>;

export const ErpGoodsReceiptSchema = z.object({
  receivedQty: decimalString,
  receivedAt: z.string(),
});
export type ErpGoodsReceipt = z.infer<typeof ErpGoodsReceiptSchema>;

export const ErpPurchaseOrderSchema = z.object({
  erpPoId: z.string(),
  poNumber: z.string(),
  status: z.string(),
  currency: z.string().length(3).default('SAR'),
  lines: z.array(ErpPoLineSchema).min(1),
  receipts: z.array(ErpGoodsReceiptSchema).default([]),
});
export type ErpPurchaseOrder = z.infer<typeof ErpPurchaseOrderSchema>;

export const ErpSyncJobPayloadSchema = z.object({
  supplierId: z.string(),
});
export type ErpSyncJobPayload = z.infer<typeof ErpSyncJobPayloadSchema>;

export const ErpSyncResultSchema = z.object({
  supplierId: z.string(),
  synced: z.number().int().nonnegative(),
});
export type ErpSyncResult = z.infer<typeof ErpSyncResultSchema>;

export interface ErpConnector {
  fetchPurchaseOrders(erpVendorId: string): Promise<ErpPurchaseOrder[]>;
}
