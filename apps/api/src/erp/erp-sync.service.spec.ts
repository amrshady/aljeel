import { describe, expect, it, vi } from 'vitest';
import { ErpSyncService } from './erp-sync.service';

describe('ErpSyncService', () => {
  it('syncs purchase orders from the ERP connector', async () => {
    const connector = {
      fetchPurchaseOrders: vi.fn().mockResolvedValue([
        {
          erpPoId: 'ERP-PO-1',
          poNumber: 'PO-TEST-1',
          status: 'OPEN',
          currency: 'SAR',
          lines: [{ description: 'Item', qty: '1', unitPrice: '100', vatRate: '15' }],
          receipts: [],
        },
      ]),
    };

    const tx = {
      purchaseOrder: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'po1' }),
        update: vi.fn(),
      },
      poLine: { deleteMany: vi.fn(), createMany: vi.fn() },
      goodsReceipt: { deleteMany: vi.fn(), createMany: vi.fn() },
    };

    const prisma = {
      supplier: {
        findUnique: vi.fn().mockResolvedValue({ id: 'supplier_a', erpVendorId: 'VEND-1' }),
      },
      $transaction: vi.fn().mockImplementation(async (fn) => fn(tx)),
    };
    const audit = { record: vi.fn() };

    const service = new ErpSyncService(prisma as never, audit as never, connector as never);
    const result = await service.syncSupplier('supplier_a');

    expect(result).toEqual({ supplierId: 'supplier_a', synced: 1 });
    expect(connector.fetchPurchaseOrders).toHaveBeenCalledWith('VEND-1');
    expect(tx.purchaseOrder.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('skips sync when supplier has no ERP vendor id', async () => {
    const prisma = {
      supplier: {
        findUnique: vi.fn().mockResolvedValue({ id: 'supplier_x', erpVendorId: null }),
      },
    };
    const audit = { record: vi.fn() };
    const connector = { fetchPurchaseOrders: vi.fn() };

    const service = new ErpSyncService(prisma as never, audit as never, connector as never);
    const result = await service.syncSupplier('supplier_x');

    expect(result).toEqual({ supplierId: 'supplier_x', synced: 0 });
    expect(connector.fetchPurchaseOrders).not.toHaveBeenCalled();
  });
});
