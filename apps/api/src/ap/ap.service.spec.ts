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
