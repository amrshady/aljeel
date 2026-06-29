import { Inject, Injectable } from '@nestjs/common';
import type { ErpPurchaseOrder, ErpSyncResult } from '@aljeel/shared-types';
import { PrismaService } from '../prisma/prisma.module';
import { AuditService } from '../audit/audit.service';
import type { ErpConnector } from '@aljeel/shared-types';
import { ERP_CONNECTOR } from './erp.constants';

@Injectable()
export class ErpSyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(ERP_CONNECTOR) private readonly connector: ErpConnector,
  ) {}

  async syncSupplier(supplierId: string, actorId?: string): Promise<ErpSyncResult> {
    const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
    if (!supplier?.erpVendorId) {
      return { supplierId, synced: 0 };
    }

    const erpOrders = await this.connector.fetchPurchaseOrders(supplier.erpVendorId);
    let synced = 0;

    for (const erpPo of erpOrders) {
      await this.upsertPurchaseOrder(supplierId, erpPo);
      synced += 1;
    }

    await this.audit.record({
      actorId,
      entity: 'Supplier',
      entityId: supplierId,
      action: 'ERP_SYNC',
      after: { synced, erpVendorId: supplier.erpVendorId },
    });

    return { supplierId, synced };
  }

  private async upsertPurchaseOrder(supplierId: string, erpPo: ErpPurchaseOrder) {
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.purchaseOrder.findUnique({
        where: { supplierId_poNumber: { supplierId, poNumber: erpPo.poNumber } },
      });

      const po = existing
        ? await tx.purchaseOrder.update({
            where: { id: existing.id },
            data: {
              status: erpPo.status,
              currency: erpPo.currency,
              erpPoId: erpPo.erpPoId,
            },
          })
        : await tx.purchaseOrder.create({
            data: {
              supplierId,
              poNumber: erpPo.poNumber,
              status: erpPo.status,
              currency: erpPo.currency,
              erpPoId: erpPo.erpPoId,
            },
          });

      await tx.poLine.deleteMany({ where: { poId: po.id } });
      await tx.goodsReceipt.deleteMany({ where: { poId: po.id } });

      await tx.poLine.createMany({
        data: erpPo.lines.map((line) => ({
          poId: po.id,
          description: line.description,
          qty: line.qty,
          unitPrice: line.unitPrice,
          vatRate: line.vatRate,
        })),
      });

      if (erpPo.receipts.length > 0) {
        await tx.goodsReceipt.createMany({
          data: erpPo.receipts.map((receipt) => ({
            poId: po.id,
            receivedQty: receipt.receivedQty,
            receivedAt: new Date(receipt.receivedAt),
          })),
        });
      }
    });
  }
}
