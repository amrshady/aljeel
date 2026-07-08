import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UnprocessableEntityException } from '@nestjs/common';
import { ApService } from './ap.service';
import type { AuthUser } from '../auth/auth.types';

const clerk: AuthUser = {
  sub: 'clerk',
  id: 'clerk',
  email: 'clerk@aljeel.com',
  fullName: 'AP Clerk',
  role: 'AP_CLERK',
  supplierId: null,
};

describe('ApService', () => {
  const audit = { record: vi.fn(), listForEntity: vi.fn().mockResolvedValue([]) };
  const asateel = {
    getStatus: vi.fn(),
    rerun: vi.fn().mockResolvedValue({ vendor: 'ASATEEL' }),
    dispatchAfterApproval: vi.fn().mockResolvedValue(undefined),
  };
  const jawal = {
    getStatus: vi.fn(),
    rerun: vi.fn().mockResolvedValue({ vendor: 'JAWAL' }),
    dispatchAfterApproval: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function underReviewPrisma() {
    const prisma = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({ id: 'inv1', status: 'UNDER_REVIEW' }),
        update: vi.fn(),
      },
      approvalStep: {
        count: vi.fn().mockResolvedValue(0),
        create: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation(async (fn) => fn(prisma)),
    };
    return prisma;
  }

  function listRow(status: string) {
    return {
      id: 'inv1',
      supplierId: 'sup1',
      invoiceNumber: 'INV-1',
      invoiceDate: new Date('2026-07-01T00:00:00.000Z'),
      poId: null,
      currency: 'SAR',
      subtotal: { toString: () => '100.00' },
      vat: { toString: () => '15.00' },
      total: { toString: () => '115.00' },
      status,
      source: 'UPLOAD',
      rejectionReason: null,
      archivedAt: null,
      asateelRegion: null,
      createdAt: new Date('2026-07-02T00:00:00.000Z'),
      updatedAt: new Date('2026-07-03T00:00:00.000Z'),
      lines: [],
      supplier: { legalName: 'Supplier One' },
    };
  }

  it('rejects approve when invoice is not under review', async () => {
    const prisma = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({ id: 'inv1', status: 'DRAFT' }),
      },
      approvalStep: { count: vi.fn() },
      $transaction: vi.fn(),
    };
    const service = new ApService(
      prisma as never,
      audit as never,
      asateel as never,
      jawal as never,
    );

    await expect(service.approve(clerk, 'inv1')).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
  });

  it('approves an invoice under review and records approval step', async () => {
    const prisma = underReviewPrisma();
    const service = new ApService(
      prisma as never,
      audit as never,
      asateel as never,
      jawal as never,
    );

    const result = await service.approve(clerk, 'inv1');

    expect(result).toEqual({ id: 'inv1', status: 'APPROVED' });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'APPROVED', entityId: 'inv1' }),
    );
  });

  it('lists queue exceptions by review statuses ordered by creation date', async () => {
    const prisma = {
      invoice: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([listRow('UNDER_REVIEW')]),
      },
      document: {
        groupBy: vi.fn().mockResolvedValue([
          { invoiceId: 'inv1', _count: { id: 2 }, _sum: { sizeBytes: 500 } },
        ]),
      },
    };
    const service = new ApService(
      prisma as never,
      audit as never,
      asateel as never,
      jawal as never,
    );

    const result = await service.listExceptions({ page: '1', pageSize: '10' });

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['UNDER_REVIEW', 'ON_HOLD'] } },
        orderBy: { createdAt: 'desc' },
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'inv1',
        status: 'UNDER_REVIEW',
        supplierName: 'Supplier One',
        documentCount: 2,
        totalSizeBytes: 500,
      }),
    );
  });

  it('lists processed exceptions by terminal statuses ordered by update date', async () => {
    const prisma = {
      invoice: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([listRow('APPROVED')]),
      },
      document: {
        groupBy: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new ApService(
      prisma as never,
      audit as never,
      asateel as never,
      jawal as never,
    );

    const result = await service.listExceptions({
      view: 'processed',
      page: '1',
      pageSize: '10',
    });

    expect(prisma.invoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['APPROVED', 'SCHEDULED', 'PAID', 'REJECTED'] } },
        orderBy: { updatedAt: 'desc' },
      }),
    );
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'inv1',
        status: 'APPROVED',
        supplierName: 'Supplier One',
        documentCount: 0,
        totalSizeBytes: 0,
      }),
    );
  });

  it('dispatches reconciliation to both vendor engines after approve', async () => {
    const prisma = underReviewPrisma();
    const service = new ApService(
      prisma as never,
      audit as never,
      asateel as never,
      jawal as never,
    );

    await service.approve(clerk, 'inv1');

    expect(asateel.dispatchAfterApproval).toHaveBeenCalledWith('inv1', 'clerk');
    expect(jawal.dispatchAfterApproval).toHaveBeenCalledWith('inv1', 'clerk');
  });

  it('routes re-run to the Jawal engine for Jawal suppliers', async () => {
    const prisma = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({ supplier: { erpIntegration: 'JAWAL' } }),
      },
    };
    const service = new ApService(
      prisma as never,
      audit as never,
      asateel as never,
      jawal as never,
    );

    await service.rerunReconciliation(clerk, 'inv1');

    expect(jawal.rerun).toHaveBeenCalledWith('inv1', 'clerk');
    expect(asateel.rerun).not.toHaveBeenCalled();
  });

  it('routes re-run to the Asateel engine for Asateel suppliers', async () => {
    const prisma = {
      invoice: {
        findUnique: vi.fn().mockResolvedValue({ supplier: { erpIntegration: 'ASATEEL' } }),
      },
    };
    const service = new ApService(
      prisma as never,
      audit as never,
      asateel as never,
      jawal as never,
    );

    await service.rerunReconciliation(clerk, 'inv1');

    expect(asateel.rerun).toHaveBeenCalledWith('inv1', 'clerk');
    expect(jawal.rerun).not.toHaveBeenCalled();
  });
});
