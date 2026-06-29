import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PurchaseOrderListQuerySchema,
  type PurchaseOrderListQuery,
} from '@aljeel/shared-types';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.module';
import type { AuthUser } from '../auth/auth.types';
import { requireSupplierId } from '../common/tenant.util';

function serializePoLine(line: {
  id: string;
  description: string;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  vatRate: Prisma.Decimal;
}) {
  return {
    id: line.id,
    description: line.description,
    qty: line.qty.toString(),
    unitPrice: line.unitPrice.toString(),
    vatRate: line.vatRate.toString(),
  };
}

function serializeReceipt(receipt: {
  id: string;
  receivedQty: Prisma.Decimal;
  receivedAt: Date;
}) {
  return {
    id: receipt.id,
    receivedQty: receipt.receivedQty.toString(),
    receivedAt: receipt.receivedAt.toISOString(),
  };
}

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser, query: Record<string, string | undefined>) {
    const params: PurchaseOrderListQuery = PurchaseOrderListQuerySchema.parse(query);
    const supplierId = requireSupplierId(user);

    const where: Prisma.PurchaseOrderWhereInput = {
      supplierId,
      ...(params.status
        ? { status: { equals: params.status, mode: 'insensitive' } }
        : {}),
      ...(params.q
        ? {
            OR: [{ poNumber: { contains: params.q, mode: 'insensitive' } }],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
        include: { _count: { select: { lines: true } } },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        supplierId: row.supplierId,
        poNumber: row.poNumber,
        status: row.status,
        currency: row.currency,
        erpPoId: row.erpPoId,
        lineCount: row._count.lines,
        createdAt: row.createdAt.toISOString(),
      })),
      page: params.page,
      pageSize: params.pageSize,
      total,
    };
  }

  async getById(user: AuthUser, id: string) {
    const supplierId = requireSupplierId(user);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, supplierId },
      include: {
        lines: { orderBy: { id: 'asc' } },
        receipts: { orderBy: { receivedAt: 'asc' } },
      },
    });
    if (!po) {
      throw new NotFoundException({
        code: 'PO_NOT_FOUND',
        message: 'Purchase order not found.',
      });
    }

    return {
      id: po.id,
      supplierId: po.supplierId,
      poNumber: po.poNumber,
      status: po.status,
      currency: po.currency,
      erpPoId: po.erpPoId,
      createdAt: po.createdAt.toISOString(),
      lines: po.lines.map(serializePoLine),
      receipts: po.receipts.map(serializeReceipt),
    };
  }
}
