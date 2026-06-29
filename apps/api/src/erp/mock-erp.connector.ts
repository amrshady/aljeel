import { Injectable } from '@nestjs/common';
import type { ErpConnector, ErpPurchaseOrder } from '@aljeel/shared-types';

/**
 * Dev/mock ERP connector — replace with SAP/Oracle/Dynamics adapter (P1-E2).
 */
@Injectable()
export class MockErpConnector implements ErpConnector {
  private readonly catalog: Record<string, ErpPurchaseOrder[]> = {
    'VEND-100001': [
      {
        erpPoId: 'ERP-PO-1001',
        poNumber: 'PO-2024-1001',
        status: 'OPEN',
        currency: 'SAR',
        lines: [
          {
            description: 'Structured cabling (Cat6)',
            qty: '100',
            unitPrice: '45.00',
            vatRate: '15',
          },
          {
            description: 'Patch panel installation',
            qty: '4',
            unitPrice: '350.00',
            vatRate: '15',
          },
        ],
        receipts: [
          { receivedQty: '80', receivedAt: '2026-05-15T10:00:00.000Z' },
          { receivedQty: '20', receivedAt: '2026-06-01T14:30:00.000Z' },
        ],
      },
      {
        erpPoId: 'ERP-PO-1002',
        poNumber: 'PO-2024-1002',
        status: 'OPEN',
        currency: 'SAR',
        lines: [
          {
            description: 'Annual software maintenance',
            qty: '1',
            unitPrice: '12000.00',
            vatRate: '15',
          },
        ],
        receipts: [{ receivedQty: '1', receivedAt: '2026-06-10T09:00:00.000Z' }],
      },
      {
        erpPoId: 'ERP-PO-1003',
        poNumber: 'PO-2023-0999',
        status: 'CLOSED',
        currency: 'SAR',
        lines: [
          {
            description: 'Office furniture supply',
            qty: '12',
            unitPrice: '890.00',
            vatRate: '15',
          },
        ],
        receipts: [{ receivedQty: '12', receivedAt: '2025-12-01T08:00:00.000Z' }],
      },
    ],
    'VEND-100002': [
      {
        erpPoId: 'ERP-PO-2001',
        poNumber: 'PO-2024-2001',
        status: 'OPEN',
        currency: 'SAR',
        lines: [
          {
            description: 'Security audit services',
            qty: '1',
            unitPrice: '25000.00',
            vatRate: '15',
          },
        ],
        receipts: [],
      },
    ],
  };

  async fetchPurchaseOrders(erpVendorId: string): Promise<ErpPurchaseOrder[]> {
    return this.catalog[erpVendorId] ?? [];
  }
}
