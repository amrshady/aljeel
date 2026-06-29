import {
  PurchaseOrderDetailSchema,
  PurchaseOrderListSchema,
} from '@aljeel/shared-types';
import { apiFetch } from './api-client';

export function listPurchaseOrders(params: Record<string, string | undefined> = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const qs = search.toString();
  return apiFetch(`/purchase-orders${qs ? `?${qs}` : ''}`, {
    schema: PurchaseOrderListSchema,
  });
}

export function getPurchaseOrder(id: string) {
  return apiFetch(`/purchase-orders/${id}`, { schema: PurchaseOrderDetailSchema });
}

export function listOpenPurchaseOrders() {
  return listPurchaseOrders({ status: 'OPEN', pageSize: '100' });
}
